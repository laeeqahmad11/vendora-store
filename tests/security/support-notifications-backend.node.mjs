import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'

import { deleteApp as deleteAdminApp, initializeApp as initializeAdminApp } from 'firebase-admin/app'
import { getAuth as getAdminAuth } from 'firebase-admin/auth'
import { getFirestore as getAdminFirestore } from 'firebase-admin/firestore'
import { deleteApp, initializeApp } from 'firebase/app'
import { connectAuthEmulator, getAuth, signInWithEmailAndPassword } from 'firebase/auth'
import {
  arrayUnion,
  connectFirestoreEmulator,
  doc,
  getFirestore,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore'

const PROJECT_ID = 'demo-vendora-e2e'
const HOST = '127.0.0.1'
const AUTH_PORT = 9099
const FIRESTORE_PORT = 8080
const PASSWORD = 'VendoraSupport!123'

if (
  PROJECT_ID !== 'demo-vendora-e2e' ||
  HOST !== '127.0.0.1' ||
  process.env.FIRESTORE_EMULATOR_HOST !== `${HOST}:${FIRESTORE_PORT}` ||
  process.env.FIREBASE_AUTH_EMULATOR_HOST !== `${HOST}:${AUTH_PORT}`
) {
  throw new Error('Refusing unsafe support-notification test target.')
}

const adminApp = initializeAdminApp({ projectId: PROJECT_ID }, 'support-notification-admin')
const adminAuth = getAdminAuth(adminApp)
const adminDb = getAdminFirestore(adminApp)
const apps = []
const clients = {}

async function createClient(uid, email) {
  await adminAuth.createUser({ uid, email, password: PASSWORD })
  const app = initializeApp(
    { apiKey: 'demo-key', projectId: PROJECT_ID, authDomain: `${PROJECT_ID}.firebaseapp.com` },
    `support-notification-${uid}`,
  )
  apps.push(app)
  const auth = getAuth(app)
  connectAuthEmulator(auth, `http://${HOST}:${AUTH_PORT}`, { disableWarnings: true })
  await signInWithEmailAndPassword(auth, email, PASSWORD)
  const firestore = getFirestore(app)
  connectFirestoreEmulator(firestore, HOST, FIRESTORE_PORT)
  return firestore
}

async function waitForNotification(title, userId, timeout = 15_000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    const snapshot = await adminDb.collection('notifications')
      .where('title', '==', title)
      .where('userId', '==', userId)
      .get()
    if (!snapshot.empty) return snapshot.docs.at(-1).data()
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error(`Timed out waiting for notification "${title}" for ${userId}.`)
}

before(async () => {
  await fetch(
    `http://${HOST}:${FIRESTORE_PORT}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`,
    { method: 'DELETE' },
  )
  await fetch(`http://${HOST}:${AUTH_PORT}/emulator/v1/projects/${PROJECT_ID}/accounts`, {
    method: 'DELETE',
  })
  clients.customer = await createClient('support-customer', 'support-customer@example.test')
  clients.admin = await createClient('support-admin', 'support-admin@example.test')
  await Promise.all([
    adminDb.doc('users/support-customer').set({
      role: 'customer', suspended: false, displayName: 'Support Customer',
    }),
    adminDb.doc('users/support-admin').set({
      role: 'admin', suspended: false, displayName: 'Support Admin',
    }),
  ])
})

after(async () => {
  await Promise.all(apps.map((app) => deleteApp(app)))
  await deleteAdminApp(adminApp)
})

test('support ticket events generate fixed trusted notifications for the correct recipients', async () => {
  const ticketRef = doc(clients.customer, 'supportTickets/ticket-1')
  await setDoc(ticketRef, {
    customerId: 'support-customer',
    customerName: 'Support Customer',
    customerEmail: 'support-customer@example.test',
    subject: 'Where is my order?',
    status: 'open',
    priority: 'medium',
    messages: [{
      senderId: 'support-customer',
      senderName: 'Support Customer',
      text: 'Please help locate it.',
      at: Date.now(),
    }],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  const created = await waitForNotification('New support ticket', 'support-admin')
  assert.equal(created.type, 'support')
  assert.equal(created.linkUrl, '/admin/support')

  await updateDoc(ticketRef, {
    messages: arrayUnion({
      senderId: 'support-customer',
      senderName: 'Support Customer',
      text: 'Adding more detail.',
      at: Date.now(),
    }),
    updatedAt: serverTimestamp(),
  })
  const customerReply = await waitForNotification('New support reply', 'support-admin')
  assert.equal(customerReply.linkUrl, '/admin/support')

  const adminTicketRef = doc(clients.admin, 'supportTickets/ticket-1')
  await updateDoc(adminTicketRef, {
    messages: arrayUnion({
      senderId: 'support-admin',
      senderName: 'Support Admin',
      text: 'We are investigating.',
      at: Date.now(),
    }),
    updatedAt: serverTimestamp(),
  })
  const staffReply = await waitForNotification('Support team replied', 'support-customer')
  assert.equal(staffReply.linkUrl, '/account/support')

  await updateDoc(adminTicketRef, {
    status: 'resolved',
    updatedAt: serverTimestamp(),
  })
  const status = await waitForNotification('Support ticket updated', 'support-customer')
  assert.match(status.body, /resolved/i)
})
