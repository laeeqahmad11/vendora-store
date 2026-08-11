import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { readFile } from 'node:fs/promises'

import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing'
import {
  Timestamp,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore'

const PROJECT_ID = 'demo-vendora-e2e'
const HOST = '127.0.0.1'
const PORT = 8080
const FIXED_TIME = Timestamp.fromMillis(1_700_000_000_000)

if (PROJECT_ID !== 'demo-vendora-e2e' || HOST !== '127.0.0.1') {
  throw new Error('Refusing unsafe notification-rules test target.')
}

let env
const clients = {}

function profile(role, suspended = false) {
  return {
    email: `${role}@notification.test`,
    displayName: `${role} notification user`,
    role,
    suspended,
    createdAt: FIXED_TIME,
    updatedAt: FIXED_TIME,
  }
}

function notification(userId, overrides = {}) {
  return {
    userId,
    type: 'order_update',
    title: 'Order update',
    body: 'Your order is confirmed.',
    linkUrl: '/account/orders/order-1',
    read: false,
    createdAt: FIXED_TIME,
    updatedAt: FIXED_TIME,
    ...overrides,
  }
}

async function seed() {
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore()
    await Promise.all([
      setDoc(doc(db, 'users/notify-customer'), profile('customer')),
      setDoc(doc(db, 'users/notify-other-customer'), profile('customer')),
      setDoc(doc(db, 'users/notify-merchant'), profile('merchant')),
      setDoc(doc(db, 'users/notify-admin'), profile('admin')),
      setDoc(doc(db, 'users/notify-suspended'), profile('customer', true)),
      setDoc(doc(db, 'notifications/customer-own'), notification('notify-customer')),
      setDoc(doc(db, 'notifications/customer-other'), notification('notify-other-customer')),
      setDoc(doc(db, 'notifications/merchant-own'), notification('notify-merchant')),
      setDoc(doc(db, 'notifications/admin-own'), notification('notify-admin', { type: 'support' })),
      setDoc(doc(db, 'notifications/suspended-own'), notification('notify-suspended')),
      setDoc(doc(db, 'notifications/customer-delete'), notification('notify-customer')),
    ])
  })
}

before(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      host: HOST,
      port: PORT,
      rules: await readFile(new URL('../../firestore.rules', import.meta.url), 'utf8'),
    },
  })
  await env.clearFirestore()
  await seed()
  clients.anonymous = env.unauthenticatedContext().firestore()
  for (const uid of [
    'notify-customer',
    'notify-other-customer',
    'notify-merchant',
    'notify-admin',
    'notify-suspended',
  ]) {
    clients[uid] = env.authenticatedContext(uid).firestore()
  }
})

after(async () => env?.cleanup())

test('anonymous users cannot read private notifications', async () => {
  await assertFails(getDoc(doc(clients.anonymous, 'notifications/customer-own')))
})

test('customers, merchants, and admins read only their own notifications', async () => {
  for (const [uid, ownId, otherId] of [
    ['notify-customer', 'customer-own', 'merchant-own'],
    ['notify-merchant', 'merchant-own', 'customer-own'],
    ['notify-admin', 'admin-own', 'customer-own'],
  ]) {
    await assertSucceeds(getDoc(doc(clients[uid], `notifications/${ownId}`)))
    await assertFails(getDoc(doc(clients[uid], `notifications/${otherId}`)))
    const ownQuery = await assertSucceeds(getDocs(query(
      collection(clients[uid], 'notifications'),
      where('userId', '==', uid),
    )))
    assert.ok(ownQuery.size >= 1)
    await assertFails(getDocs(query(
      collection(clients[uid], 'notifications'),
      where('userId', '==', uid === 'notify-customer' ? 'notify-merchant' : 'notify-customer'),
    )))
  }
})

test('no customer, merchant, or admin browser client can create a notification', async () => {
  for (const uid of ['notify-customer', 'notify-merchant', 'notify-admin']) {
    await assertFails(setDoc(
      doc(clients[uid], `notifications/forged-by-${uid}`),
      notification(uid),
    ))
  }
})

test('direct clients cannot forge trusted order, refund, store, or product events for another user', async () => {
  const forgeries = [
    { title: 'Order delivered', body: 'Your order was delivered.', type: 'order_update', linkUrl: '/account/orders/fake' },
    { title: 'Refund approved', body: 'Your refund was approved.', type: 'order_update', linkUrl: '/account/orders/fake' },
    { title: 'Store approved', body: 'Your store is live.', type: 'approval', linkUrl: '/merchant' },
    { title: 'Product approved', body: 'Your product is live.', type: 'approval', linkUrl: '/merchant/products' },
  ]
  for (const [index, forgery] of forgeries.entries()) {
    await assertFails(setDoc(
      doc(clients['notify-customer'], `notifications/direct-forgery-${index}`),
      notification('notify-merchant', forgery),
    ))
  }
})

test('an owner can change only read state and cannot mutate trusted identity or content', async () => {
  const ownRef = doc(clients['notify-customer'], 'notifications/customer-own')
  await assertSucceeds(updateDoc(ownRef, { read: true, updatedAt: serverTimestamp() }))
  assert.equal((await getDoc(ownRef)).data().read, true)
  await assertSucceeds(updateDoc(ownRef, { read: false, updatedAt: serverTimestamp() }))
  const batch = writeBatch(clients['notify-customer'])
  batch.update(ownRef, { read: true, updatedAt: serverTimestamp() })
  await assertSucceeds(batch.commit())
  assert.equal((await getDoc(ownRef)).data().read, true)

  for (const mutation of [
    { userId: 'notify-merchant', updatedAt: serverTimestamp() },
    { type: 'approval', updatedAt: serverTimestamp() },
    { title: 'Order delivered', updatedAt: serverTimestamp() },
    { body: 'Forged refund approval', updatedAt: serverTimestamp() },
    { linkUrl: '/admin/stores', updatedAt: serverTimestamp() },
    { orderId: 'forged-related-entity', updatedAt: serverTimestamp() },
    { read: 'yes', updatedAt: serverTimestamp() },
    { createdAt: serverTimestamp(), updatedAt: serverTimestamp() },
  ]) {
    await assertFails(updateDoc(ownRef, mutation))
  }
})

test('users cannot update another recipient read state', async () => {
  await assertFails(updateDoc(
    doc(clients['notify-customer'], 'notifications/merchant-own'),
    { read: true, updatedAt: serverTimestamp() },
  ))
})

test('active owners may delete their own notification but not another user notification', async () => {
  await assertSucceeds(deleteDoc(doc(clients['notify-customer'], 'notifications/customer-delete')))
  await assertFails(deleteDoc(doc(clients['notify-customer'], 'notifications/merchant-own')))
})

test('suspended users retain their private read but cannot create, update, or delete notifications', async () => {
  const ownRef = doc(clients['notify-suspended'], 'notifications/suspended-own')
  await assertSucceeds(getDoc(ownRef))
  await assertFails(setDoc(
    doc(clients['notify-suspended'], 'notifications/suspended-forgery'),
    notification('notify-suspended'),
  ))
  await assertFails(updateDoc(ownRef, { read: true, updatedAt: serverTimestamp() }))
  await assertFails(deleteDoc(ownRef))
})
