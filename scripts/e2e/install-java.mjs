/**
 * Installs a verified Eclipse Temurin Java 21 runtime under .firebase/java.
 * The ignored repository-local location survives temporary-directory cleanup,
 * and normal E2E runs never access the network to locate or download Java.
 */

import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import {
  firebaseDirectory,
  findJava,
  localJavaHome,
  repositoryRoot,
} from './runtime.mjs'

const API_URL =
  'https://api.adoptium.net/v3/assets/latest/21/hotspot?architecture=x64&image_type=jre&os=windows&vendor=eclipse'

function assertSupportedPlatform() {
  if (process.platform !== 'win32' || process.arch !== 'x64') {
    throw new Error(
      'Automatic Java provisioning currently supports Windows x64. Install Java 21+ and set JAVA_HOME or E2E_JAVA_HOME.',
    )
  }
}

async function fetchChecked(url, description) {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'vendora-e2e-java-installer' },
    redirect: 'follow',
    signal: AbortSignal.timeout(description === 'Temurin runtime' ? 300_000 : 30_000),
  })
  if (!response.ok) {
    throw new Error(`${description} request failed (${response.status} ${response.statusText})`)
  }
  return response
}

async function sha256(file) {
  const hash = createHash('sha256')
  await pipeline(createReadStream(file), hash)
  return hash.digest('hex')
}

async function main() {
  const existing = findJava().compatible
  if (existing && path.resolve(existing.command).startsWith(path.resolve(localJavaHome))) {
    console.log(`Repository-local Java ${existing.major} is already installed at ${localJavaHome}.`)
    return
  }

  assertSupportedPlatform()
  await fs.mkdir(firebaseDirectory, { recursive: true })

  const metadataResponse = await fetchChecked(API_URL, 'Temurin metadata')
  const assets = await metadataResponse.json()
  const packageInfo = assets?.[0]?.binary?.package
  if (!packageInfo?.link || !packageInfo?.checksum) {
    throw new Error('Temurin metadata did not contain a download link and SHA-256 checksum.')
  }

  const archive = path.join(firebaseDirectory, `java-${process.pid}.zip`)
  const staging = path.join(firebaseDirectory, `java-${process.pid}-extract`)
  console.log(`Downloading ${packageInfo.name ?? 'Eclipse Temurin Java 21'} once...`)

  try {
    const download = await fetchChecked(packageInfo.link, 'Temurin runtime')
    if (!download.body) throw new Error('Temurin runtime response had no body.')
    await pipeline(Readable.fromWeb(download.body), createWriteStream(archive))

    const actualChecksum = await sha256(archive)
    if (actualChecksum.toLowerCase() !== packageInfo.checksum.toLowerCase()) {
      throw new Error(
        `Temurin checksum mismatch: expected ${packageInfo.checksum}, received ${actualChecksum}.`,
      )
    }

    await fs.mkdir(staging, { recursive: true })
    const extracted = spawnSync('tar.exe', ['-xf', archive, '-C', staging], {
      cwd: repositoryRoot,
      encoding: 'utf8',
      windowsHide: true,
    })
    if (extracted.status !== 0) {
      throw new Error(`Could not extract Java runtime: ${extracted.stderr || extracted.stdout}`)
    }

    const entries = await fs.readdir(staging, { withFileTypes: true })
    const runtimeRoot = entries.find((entry) => entry.isDirectory())
    if (!runtimeRoot) throw new Error('The Java archive did not contain a runtime directory.')

    const extractedHome = path.join(staging, runtimeRoot.name)
    await fs.access(path.join(extractedHome, 'bin', 'java.exe'))
    await fs.rm(localJavaHome, { recursive: true, force: true })
    await fs.rename(extractedHome, localJavaHome)

    const installed = findJava().compatible
    if (!installed || installed.major < 21) {
      throw new Error('The downloaded Java runtime failed its version check.')
    }
    console.log(`Installed Java ${installed.major} at ${localJavaHome}.`)
  } finally {
    await Promise.all([
      fs.rm(archive, { force: true }),
      fs.rm(staging, { recursive: true, force: true }),
    ])
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
