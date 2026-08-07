/**
 * Firebase CLI launcher for emulator-only E2E commands.
 *
 * The stock CLI performs message-of-the-day and optional analytics requests.
 * This launcher disables those features, blocks non-loopback fetches, and
 * prevents implicit emulator binary downloads during normal test runs.
 *
 * `--allow-downloads` is reserved for the explicit one-time
 * `e2e:emulators:install` command.
 */

import { createRequire } from 'node:module'
import path from 'node:path'

const require = createRequire(import.meta.url)
const allowDownloads = process.argv[2] === '--allow-downloads'

if (allowDownloads) {
  process.argv.splice(2, 1)
}

process.env.NO_UPDATE_NOTIFIER = '1'
process.env.DEBUG = ''
process.env.XDG_CONFIG_HOME = path.resolve('.firebase', 'e2e-config')
process.env.FIREBASE_EMULATORS_PATH = path.resolve('.firebase', 'emulators')

const nativeFetch = globalThis.fetch
globalThis.fetch = async (input, init) => {
  const url = new URL(
    typeof input === 'string' || input instanceof URL ? input : input.url,
  )
  const isPinnedEmulatorDownload =
    allowDownloads &&
    url.protocol === 'https:' &&
    url.hostname === 'storage.googleapis.com' &&
    url.pathname.startsWith('/firebase-preview-drop/emulator/')

  if (
    (url.protocol === 'http:' || url.protocol === 'https:') &&
    !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) &&
    !isPinnedEmulatorDownload
  ) {
    throw new Error(`Firebase E2E CLI blocked non-loopback request: ${url.origin}`)
  }

  return nativeFetch(input, init)
}

// Patch before loading the CLI so its startup path cannot make remote calls.
const motd = require('../../node_modules/firebase-tools/lib/fetchMOTD.js')
motd.fetchMOTD = () => undefined

if (!allowDownloads) {
  const downloads = require('../../node_modules/firebase-tools/lib/emulator/download.js')
  downloads.downloadEmulator = async (name) => {
    throw new Error(
      `${name} emulator binary is not installed. Run "npm run e2e:emulators:install" once.`,
    )
  }
}

const firebasePackage = require('../../node_modules/firebase-tools/package.json')
const { cli } = require('../../node_modules/firebase-tools/lib/bin/cli.js')
cli(firebasePackage)
