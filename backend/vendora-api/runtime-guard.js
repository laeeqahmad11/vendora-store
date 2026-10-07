export const LOCAL_PROJECT_ID = 'demo-vendora-e2e'

function loopbackEndpoint(value) {
  if (typeof value !== 'string') return false
  const match = /^(?:localhost|127\.0\.0\.1|\[::1\]):([1-9][0-9]{0,4})$/u.exec(value)
  if (!match) return false
  const port = Number(match[1])
  return port >= 1 && port <= 65_535
}

export function assertLoopbackEmulatorEndpoint(value, label = 'Emulator') {
  if (!loopbackEndpoint(value)) {
    throw new Error(`Vendora API requires a strict loopback ${label} endpoint.`)
  }
  return value
}

export function assertLocalEmulatorRuntime(environment = globalThis.process?.env ?? {}) {
  const projectId = environment.GCLOUD_PROJECT ?? environment.GOOGLE_CLOUD_PROJECT
  const firestoreHost = environment.FIRESTORE_EMULATOR_HOST
  const authHost = environment.FIREBASE_AUTH_EMULATOR_HOST

  if (projectId !== LOCAL_PROJECT_ID) {
    throw new Error(`Vendora API refuses Firebase project ${projectId ?? '(missing)'}.`)
  }
  assertLoopbackEmulatorEndpoint(firestoreHost, 'Firestore Emulator')
  assertLoopbackEmulatorEndpoint(authHost, 'Auth Emulator')

  return Object.freeze({ projectId, firestoreHost, authHost })
}

export function assertLoopbackListenHost(hostname) {
  if (!['127.0.0.1', 'localhost', '::1'].includes(hostname)) {
    throw new Error('Vendora API may listen on loopback only during Phase 3A.')
  }
}
