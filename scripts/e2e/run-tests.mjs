/**
 * Deterministic owner for the E2E process tree.
 *
 * This intentionally avoids `firebase emulators:exec`, Playwright webServer,
 * npm shims, and shell command chains. Every long-lived child has one owner,
 * bounded startup/teardown, and a final listener audit.
 */

import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs/promises'
import http from 'node:http'
import net from 'node:net'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { configureJava, repositoryRoot } from './runtime.mjs'

const mode = process.argv[2]
const playwrightArguments = process.argv.slice(3)
const PROJECT_ID = 'demo-vendora-e2e'
const HOST = '127.0.0.1'
const BASE_URL = `http://${HOST}:5173`
const BUILD_DIRECTORY = path.join(repositoryRoot, '.firebase', 'e2e-build', mode)
const FIREBASE_PORTS = [4400, 4500, 8080, 9099, 9150, 9199]
const MANAGED_PORTS = mode === 'authenticated' ? [5173, ...FIREBASE_PORTS] : [5173]
const children = new Set()
let cleaningUp = false

function hasExited(child) {
  return child.exitCode !== null || child.signalCode !== null
}

if (!['authenticated', 'public'].includes(mode)) {
  throw new Error('Usage: node scripts/e2e/run-tests.mjs <authenticated|public> [Playwright arguments]')
}
if (!PROJECT_ID.startsWith('demo-') || HOST !== '127.0.0.1') {
  throw new Error(`Refusing unsafe E2E target: ${PROJECT_ID} at ${HOST}`)
}

function childProcess(command, args, options = {}) {
  const child = spawn(command, args, {
    cwd: repositoryRoot,
    env: process.env,
    stdio: 'inherit',
    windowsHide: true,
    ...options,
  })
  child.completion = new Promise((resolve, reject) => {
    child.once('error', reject)
    child.once('exit', (code, signal) => {
      children.delete(child)
      resolve({ code, signal })
    })
  })
  children.add(child)
  return child
}

function portIsOpen(port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: HOST, port })
    socket.setTimeout(500)
    socket.once('connect', () => {
      socket.destroy()
      resolve(true)
    })
    socket.once('timeout', () => {
      socket.destroy()
      resolve(false)
    })
    socket.once('error', () => resolve(false))
  })
}

function listenerOwners(ports) {
  if (process.platform !== 'win32') return ''
  const result = spawnSync('netstat.exe', ['-ano', '-p', 'tcp'], {
    encoding: 'utf8',
    windowsHide: true,
  })
  const matches = (result.stdout ?? '')
    .split(/\r?\n/)
    .filter(
      (line) =>
        line.includes('LISTENING') &&
        ports.some((port) => line.match(new RegExp(`:${port}\\s`))),
    )
  return matches.length ? `\n${matches.join('\n')}` : ''
}

async function assertPortsFree(ports, phase) {
  const states = await Promise.all(ports.map(async (port) => [port, await portIsOpen(port)]))
  const occupied = states.filter(([, open]) => open).map(([port]) => port)
  if (occupied.length) {
    throw new Error(
      `${phase}: localhost port(s) ${occupied.join(', ')} are still listening.` +
        listenerOwners(occupied),
    )
  }
}

async function waitFor(description, check, child, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  let lastError
  while (Date.now() < deadline) {
    if (child && hasExited(child)) {
      throw new Error(
        `${description} process exited early ` +
          (child.signalCode ? `from ${child.signalCode}.` : `with code ${child.exitCode}.`),
      )
    }
    try {
      if (await check()) return
    } catch (error) {
      lastError = error
    }
    await delay(100)
  }
  throw new Error(
    `${description} did not become ready within ${timeoutMs}ms.` +
      (lastError ? ` Last error: ${lastError.message}` : ''),
  )
}

async function waitForHttp(url, child, timeoutMs = 60_000) {
  await waitFor(
    url,
    async () => {
      const response = await fetch(url, { signal: AbortSignal.timeout(1_000) })
      return response.ok
    },
    child,
    timeoutMs,
  )
}

const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
}

async function loadBuildFiles(directory, relative = '') {
  const files = new Map()
  const entries = await fs.readdir(path.join(directory, relative), { withFileTypes: true })
  for (const entry of entries) {
    const relativePath = path.join(relative, entry.name)
    if (entry.isDirectory()) {
      for (const [url, file] of await loadBuildFiles(directory, relativePath)) files.set(url, file)
      continue
    }
    const url = `/${relativePath.split(path.sep).join('/')}`
    files.set(url, {
      body: await fs.readFile(path.join(directory, relativePath)),
      type: contentTypes[path.extname(entry.name).toLowerCase()] ?? 'application/octet-stream',
    })
  }
  return files
}

async function startStaticServer() {
  const files = await loadBuildFiles(BUILD_DIRECTORY)
  const fallback = files.get('/index.html')
  if (!fallback) throw new Error(`Vite E2E build did not create ${BUILD_DIRECTORY}/index.html.`)

  const server = http.createServer((request, response) => {
    if (!request.url || !['GET', 'HEAD'].includes(request.method ?? '')) {
      response.writeHead(405).end()
      return
    }

    let pathname
    try {
      pathname = decodeURIComponent(new URL(request.url, BASE_URL).pathname)
    } catch {
      response.writeHead(400).end()
      return
    }

    const file = files.get(pathname) ?? fallback
    response.writeHead(200, {
      'Cache-Control': pathname.startsWith('/assets/')
        ? 'public, max-age=31536000, immutable'
        : 'no-cache',
      'Content-Length': file.body.length,
      'Content-Type': file.type,
    })
    response.end(request.method === 'HEAD' ? undefined : file.body)
  })

  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(5173, HOST, resolve)
  })
  return server
}

async function stopStaticServer(server) {
  if (!server?.listening) return
  server.closeAllConnections?.()
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()))
  })
}

async function waitForEmulators(child) {
  await waitFor(
    'Firebase emulators',
    async () => {
      const response = await fetch(`http://${HOST}:4400/emulators`, {
        signal: AbortSignal.timeout(1_000),
      })
      if (!response.ok) return false
      const running = await response.json()
      const registered = ['auth', 'firestore', 'storage'].every(
        (name) => running[name]?.host === HOST && Number(running[name]?.port) > 0,
      )
      if (!registered) return false

      const listeners = await Promise.all(FIREBASE_PORTS.map(portIsOpen))
      return listeners.every(Boolean)
    },
    child,
    120_000,
  )
}

async function terminateTree(child, label, { gracefulFirebase = false } = {}) {
  if (!child || hasExited(child)) return

  if (gracefulFirebase && child.connected) {
    child.send({ type: 'vendora-e2e-shutdown' })
    const graceful = await Promise.race([
      child.completion.then(() => true),
      delay(15_000, false),
    ])
    if (graceful) return
    console.error(`${label} did not stop after its clean-shutdown deadline; terminating its process tree.`)
  }

  // Vite and Playwright are spawned directly, so Node can terminate the owned
  // process without relying on Windows shell/process-group behavior.
  child.kill('SIGTERM')
  let stopped = await Promise.race([
    child.completion.then(() => true),
    delay(5_000, false),
  ])

  if (!stopped && process.platform === 'win32') {
    const forced = spawnSync('taskkill.exe', ['/pid', String(child.pid), '/T', '/F'], {
      encoding: 'utf8',
      windowsHide: true,
    })
    if (forced.status !== 0) {
      console.error(
        `${label} taskkill fallback failed (${forced.status}): ${forced.stderr || forced.stdout}`,
      )
    }
    stopped = await Promise.race([
      child.completion.then(() => true),
      delay(5_000, false),
    ])
  }

  if (!stopped) throw new Error(`${label} process ${child.pid} did not exit after termination.`)
}

async function cleanup(staticServer, firebase) {
  if (cleaningUp) return
  cleaningUp = true
  const errors = []

  try {
    await stopStaticServer(staticServer)
  } catch (error) {
    errors.push(error)
  }

  for (const [child, label, options] of [
    [firebase, 'Firebase', { gracefulFirebase: true }],
  ]) {
    try {
      await terminateTree(child, label, options)
    } catch (error) {
      errors.push(error)
    }
  }

  try {
    await waitFor(
      'managed E2E ports to close',
      async () => !(await Promise.all(MANAGED_PORTS.map(portIsOpen))).some(Boolean),
      null,
      15_000,
    )
    await assertPortsFree(MANAGED_PORTS, 'E2E teardown')
  } catch (error) {
    errors.push(error)
  }

  if (errors.length) throw new AggregateError(errors, 'E2E cleanup failed')
}

function viteEnvironment() {
  const authenticated = mode === 'authenticated'
  return {
    ...process.env,
    VITE_FIREBASE_API_KEY: authenticated ? 'demo-vendora-e2e-api-key' : '',
    VITE_FIREBASE_AUTH_DOMAIN: authenticated ? `${PROJECT_ID}.firebaseapp.com` : '',
    VITE_FIREBASE_PROJECT_ID: authenticated ? PROJECT_ID : '',
    VITE_FIREBASE_STORAGE_BUCKET: authenticated ? `${PROJECT_ID}.appspot.com` : '',
    VITE_FIREBASE_MESSAGING_SENDER_ID: authenticated ? '000000000000' : '',
    VITE_FIREBASE_APP_ID: authenticated ? '1:000000000000:web:e2e000000000000000000' : '',
    VITE_USE_EMULATORS: authenticated ? 'true' : 'false',
    VITE_E2E_SINGLE_BUNDLE: 'true',
  }
}

async function run() {
  await assertPortsFree(MANAGED_PORTS, 'E2E startup')
  let firebase
  let staticServer
  let testExitCode = 1

  try {
    if (mode === 'authenticated') {
      const java = configureJava()
      console.log(`Using Java ${java.major}: ${java.command}`)
      firebase = childProcess(
        process.execPath,
        [
          '--use-system-ca',
          path.join(repositoryRoot, 'scripts/e2e/firebase-cli-local.mjs'),
          'emulators:start',
          '--project',
          PROJECT_ID,
          '--only',
          'auth,firestore,storage',
        ],
        { stdio: ['ignore', 'inherit', 'inherit', 'ipc'] },
      )
      await waitForEmulators(firebase)
    }

    const viteBuild = childProcess(
      process.execPath,
      [
        path.join(repositoryRoot, 'node_modules/vite/bin/vite.js'),
        'build',
        '--outDir',
        BUILD_DIRECTORY,
        '--emptyOutDir',
      ],
      { env: viteEnvironment() },
    )
    const buildResult = await viteBuild.completion
    if (buildResult.code !== 0) {
      throw new Error(`Vite E2E build exited with code ${buildResult.code}.`)
    }

    staticServer = await startStaticServer()
    await waitForHttp(BASE_URL, null)

    if (mode === 'authenticated') {
      const seed = childProcess(process.execPath, [path.join(repositoryRoot, 'scripts/e2e/seed-emulators.mjs')])
      const result = await seed.completion
      if (result.code !== 0) throw new Error(`Emulator seed exited with code ${result.code}.`)
    }

    const config = mode === 'authenticated' ? 'playwright.auth.config.ts' : 'playwright.config.ts'
    const playwright = childProcess(
      process.execPath,
      [
        path.join(repositoryRoot, 'node_modules/@playwright/test/cli.js'),
        'test',
        `--config=${config}`,
        ...playwrightArguments,
      ],
      {
        env: {
          ...process.env,
          PLAYWRIGHT_BASE_URL: BASE_URL,
          PLAYWRIGHT_MANAGED_SERVER: 'true',
        },
      },
    )
    const result = await playwright.completion
    testExitCode = result.code ?? 1
  } finally {
    await cleanup(staticServer, firebase)
  }

  process.exitCode = testExitCode
}

let interrupted = false
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    if (interrupted) return
    interrupted = true
    process.exitCode = signal === 'SIGINT' ? 130 : 143
    for (const child of children) {
      if (hasExited(child)) continue
      if (child.connected) child.send({ type: 'vendora-e2e-shutdown' })
      else child.kill('SIGTERM')
    }
  })
}

run().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
