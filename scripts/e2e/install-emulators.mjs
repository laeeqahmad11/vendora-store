/** Download only missing Firebase emulator artifacts for the pinned CLI version. */

import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'
import { firebaseDirectory, repositoryRoot } from './runtime.mjs'

const require = createRequire(import.meta.url)
const emulatorDirectory = path.join(firebaseDirectory, 'emulators')
process.env.XDG_CONFIG_HOME = path.join(firebaseDirectory, 'e2e-config')
process.env.FIREBASE_EMULATORS_PATH = emulatorDirectory

const downloadableEmulators = require('../../node_modules/firebase-tools/lib/emulator/downloadableEmulators.js')
const launcher = path.join(repositoryRoot, 'scripts/e2e/firebase-cli-local.mjs')

for (const name of ['firestore', 'storage']) {
  const details = downloadableEmulators.getDownloadDetails(name)
  const executable = details.binaryPath || details.downloadPath
  if (fs.existsSync(executable)) {
    console.log(`${name} emulator is already installed at ${executable}.`)
    continue
  }

  const result = spawnSync(
    process.execPath,
    ['--use-system-ca', launcher, '--allow-downloads', `setup:emulators:${name}`],
    {
      cwd: repositoryRoot,
      env: process.env,
      stdio: 'inherit',
      windowsHide: true,
    },
  )
  if (result.status !== 0) {
    throw new Error(`${name} emulator installation exited with code ${result.status}.`)
  }
  if (!fs.existsSync(executable)) {
    throw new Error(`${name} emulator installation completed without creating ${executable}.`)
  }
}
