import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'

import { deleteApp as deleteAdminApp, initializeApp as initializeAdminApp } from 'firebase-admin/app'
import { getAuth as getAdminAuth } from 'firebase-admin/auth'
import { getFirestore as getAdminFirestore } from 'firebase-admin/firestore'
import { deleteApp, initializeApp } from 'firebase/app'
import { connectAuthEmulator, getAuth, signInWithEmailAndPassword } from 'firebase/auth'

const PROJECT_ID = 'demo-vendora-e2e'
const HOST = '127.0.0.1'
const PASSWORD = 'VendoraModeration!123'
const URL = `http://${HOST}:5001/${PROJECT_ID}/us-central1/moderateStore`

if (
  PROJECT_ID !== 'demo-vendora-e2e' ||
  HOST !== '127.0.0.1' ||
  process.env.FIRESTORE_EMULATOR_HOST !== `${HOST}:8080` ||
  process.env.FIREBASE_AUTH_EMULATOR_HOST !== `${HOST}:9099`
) throw new Error('Refusing unsafe store-moderation test target.')

const adminApp = initializeAdminApp({ projectId: PROJECT_ID }, 'store-moderation-admin')
const adminAuth = getAdminAuth(adminApp)
const adminDb = getAdminFirestore(adminApp)
const clientApps = []
const tokens = {}

async function createClient(uid, email) {
  await adminAuth.createUser({ uid, email, password: PASSWORD })
  const app = initializeApp(
    { apiKey: 'demo-key', projectId: PROJECT_ID, authDomain: `${PROJECT_ID}.firebaseapp.com` },
    `moderation-${uid}`,
  )
  clientApps.push(app)
  const auth = getAuth(app)
  connectAuthEmulator(auth, `http://${HOST}:9099`, { disableWarnings: true })
  const credential = await signInWithEmailAndPassword(auth, email, PASSWORD)
  tokens[uid] = await credential.user.getIdToken()
}

async function invoke(uid, data) {
  const response = await fetch(URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokens[uid]}` },
    body: JSON.stringify({ data }),
  })
  const payload = await response.json()
  if (payload.error) {
    const error = new Error(payload.error.message)
    error.status = payload.error.status
    throw error
  }
  return payload.result
}

before(async () => {
  await fetch(`http://${HOST}:8080/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`, { method: 'DELETE' })
  await fetch(`http://${HOST}:9099/emulator/v1/projects/${PROJECT_ID}/accounts`, { method: 'DELETE' })
  await createClient('moderation-admin', 'moderation-admin@example.test')
  await createClient('moderation-suspended-admin', 'moderation-suspended-admin@example.test')
  await createClient('moderation-customer', 'moderation-customer@example.test')
  await Promise.all([
    adminDb.doc('users/moderation-admin').set({ role: 'admin', suspended: false }),
    adminDb.doc('users/moderation-suspended-admin').set({ role: 'admin', suspended: true }),
    adminDb.doc('users/moderation-customer').set({ role: 'customer', suspended: false }),
    adminDb.doc('users/moderation-owner').set({ role: 'merchant', storeId: 'moderation-store' }),
    adminDb.doc('stores/moderation-store').set({ ownerId: 'moderation-owner', status: 'approved' }),
    adminDb.doc('merchantApplications/moderation-store').set({
      storeId: 'moderation-store', ownerId: 'moderation-owner', status: 'approved', rejectionReason: '',
    }),
    adminDb.doc('products/moderation-approved-product').set({
      storeId: 'moderation-store', status: 'approved', publiclyVisible: true,
    }),
    adminDb.doc('products/moderation-draft-product').set({
      storeId: 'moderation-store', status: 'draft', publiclyVisible: false,
    }),
  ])
})

after(async () => {
  await Promise.all(clientApps.map((app) => deleteApp(app)))
  await deleteAdminApp(adminApp)
})

test('active admin suspension hides products before completing moderation state', async () => {
  const result = await invoke('moderation-admin', {
    storeId: 'moderation-store', status: 'suspended', reason: 'Policy review',
  })
  assert.equal(result.status, 'suspended')
  const [store, application, product, publicStore] = await Promise.all([
    adminDb.doc('stores/moderation-store').get(),
    adminDb.doc('merchantApplications/moderation-store').get(),
    adminDb.doc('products/moderation-approved-product').get(),
    adminDb.doc('publicStores/moderation-store').get(),
  ])
  assert.equal(store.data().status, 'suspended')
  assert.equal(application.data().status, 'suspended')
  assert.equal(application.data().rejectionReason, 'Policy review')
  assert.equal(product.data().publiclyVisible, false)
  assert.equal(publicStore.exists, false)
  const notifications = await adminDb.collection('notifications')
    .where('title', '==', 'Store suspended').get()
  assert.equal(notifications.size, 1)
  assert.equal(notifications.docs[0].get('userId'), 'moderation-owner')
  assert.match(notifications.docs[0].get('body'), /Policy review/)
})

test('active admin approval restores only approved-product visibility and owner linkage', async () => {
  const result = await invoke('moderation-admin', { storeId: 'moderation-store', status: 'approved' })
  assert.equal(result.status, 'approved')
  const [store, application, approved, draft, owner, publicStore] = await Promise.all([
    adminDb.doc('stores/moderation-store').get(),
    adminDb.doc('merchantApplications/moderation-store').get(),
    adminDb.doc('products/moderation-approved-product').get(),
    adminDb.doc('products/moderation-draft-product').get(),
    adminDb.doc('users/moderation-owner').get(),
    adminDb.doc('publicStores/moderation-store').get(),
  ])
  assert.equal(store.data().status, 'approved')
  assert.equal(application.data().status, 'approved')
  assert.equal(approved.data().publiclyVisible, true)
  assert.equal(draft.data().publiclyVisible, false)
  assert.equal(owner.data().role, 'merchant')
  assert.equal(owner.data().storeId, 'moderation-store')
  assert.equal(publicStore.data().status, 'approved')
  assert.equal(publicStore.data().ownerId, 'moderation-owner')
  const notifications = await adminDb.collection('notifications')
    .where('title', '==', 'Store approved').get()
  assert.equal(notifications.size, 1)
  assert.equal(notifications.docs[0].get('userId'), 'moderation-owner')
})

test('suspended admins and customers cannot invoke trusted store moderation', async () => {
  await assert.rejects(
    invoke('moderation-suspended-admin', { storeId: 'moderation-store', status: 'suspended' }),
    (error) => error.status === 'PERMISSION_DENIED',
  )
  await assert.rejects(
    invoke('moderation-customer', { storeId: 'moderation-store', status: 'suspended' }),
    (error) => error.status === 'PERMISSION_DENIED',
  )
})
