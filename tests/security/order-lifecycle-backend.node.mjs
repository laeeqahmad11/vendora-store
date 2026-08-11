import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'

import { initializeApp as initializeAdminApp, deleteApp as deleteAdminApp } from 'firebase-admin/app'
import { getAuth as getAdminAuth } from 'firebase-admin/auth'
import { getFirestore as getAdminFirestore } from 'firebase-admin/firestore'
import { deleteApp, initializeApp } from 'firebase/app'
import { connectAuthEmulator, getAuth, signInWithEmailAndPassword } from 'firebase/auth'
import { connectFirestoreEmulator, doc, getFirestore, setDoc, updateDoc } from 'firebase/firestore'

const PROJECT_ID = 'demo-vendora-e2e'
const HOST = '127.0.0.1'
const AUTH_PORT = 9099
const FIRESTORE_PORT = 8080
const FUNCTIONS_PORT = 5001
const PASSWORD = 'VendoraOrders!123'

if (
  PROJECT_ID !== 'demo-vendora-e2e' ||
  HOST !== '127.0.0.1' ||
  process.env.FIRESTORE_EMULATOR_HOST !== `${HOST}:${FIRESTORE_PORT}` ||
  process.env.FIREBASE_AUTH_EMULATOR_HOST !== `${HOST}:${AUTH_PORT}`
) {
  throw new Error('Refusing unsafe order-lifecycle test target.')
}

const adminApp = initializeAdminApp({ projectId: PROJECT_ID }, 'order-lifecycle-security-admin')
const adminAuth = getAdminAuth(adminApp)
const adminDb = getAdminFirestore(adminApp)
const clientApps = []
const clients = {}

function order(id, status, overrides = {}) {
  const now = 1_700_000_000_000
  return {
    orderNumber: `VND-${id.toUpperCase()}`,
    customerId: 'orders-customer-1',
    merchantId: 'orders-merchant-1',
    storeId: 'orders-store-1',
    paymentMethod: 'cod',
    cashReceived: false,
    status,
    timeline: [{ status, at: now, by: 'seed', note: 'Seeded order' }],
    items: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

async function createClient(uid, email) {
  const app = initializeApp(
    { apiKey: 'demo-key', projectId: PROJECT_ID, authDomain: `${PROJECT_ID}.firebaseapp.com` },
    `order-lifecycle-${uid}`,
  )
  clientApps.push(app)
  const auth = getAuth(app)
  connectAuthEmulator(auth, `http://${HOST}:${AUTH_PORT}`, { disableWarnings: true })
  const credential = await signInWithEmailAndPassword(auth, email, PASSWORD)
  const firestore = getFirestore(app)
  connectFirestoreEmulator(firestore, HOST, FIRESTORE_PORT)
  return { firestore, token: await credential.user.getIdToken() }
}

async function invoke(functionName, data, token) {
  const response = await fetch(
    `http://${HOST}:${FUNCTIONS_PORT}/${PROJECT_ID}/us-central1/${functionName}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ data }),
    },
  )
  const payload = await response.json()
  if (payload.error) {
    const error = new Error(payload.error.message)
    error.status = payload.error.status
    throw error
  }
  return payload.result
}

async function expectCallableError(promise, status, messagePattern) {
  await assert.rejects(
    promise,
    (error) => error.status === status && messagePattern.test(error.message),
  )
}

async function expectFirestoreDenied(promise) {
  await assert.rejects(promise, (error) => error.code === 'permission-denied')
}

async function seed() {
  await fetch(
    `http://${HOST}:${FIRESTORE_PORT}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`,
    { method: 'DELETE' },
  )
  await fetch(`http://${HOST}:${AUTH_PORT}/emulator/v1/projects/${PROJECT_ID}/accounts`, {
    method: 'DELETE',
  })

  const users = [
    ['orders-customer-1', 'orders-customer-1@example.test', 'customer', false],
    ['orders-customer-2', 'orders-customer-2@example.test', 'customer', false],
    ['orders-merchant-1', 'orders-merchant-1@example.test', 'merchant', false],
    ['orders-merchant-2', 'orders-merchant-2@example.test', 'merchant', false],
    ['orders-merchant-suspended', 'orders-merchant-suspended@example.test', 'merchant', true],
    ['orders-admin', 'orders-admin@example.test', 'admin', false],
    ['orders-admin-suspended', 'orders-admin-suspended@example.test', 'admin', true],
  ]
  for (const [uid, email, role, suspended] of users) {
    await adminAuth.createUser({ uid, email, password: PASSWORD })
    await adminDb.doc(`users/${uid}`).set({
      email,
      displayName: uid,
      role,
      suspended,
    })
  }

  await Promise.all([
    adminDb.doc('stores/orders-store-1').set({
      ownerId: 'orders-merchant-1', status: 'approved', name: 'Orders Store One',
    }),
    adminDb.doc('stores/orders-store-2').set({
      ownerId: 'orders-merchant-2', status: 'approved', name: 'Orders Store Two',
    }),
    adminDb.doc('stores/orders-store-suspended').set({
      ownerId: 'orders-merchant-suspended', status: 'approved', name: 'Suspended Owner Store',
    }),
  ])

  const orders = [
    ['skip', order('skip', 'pending')],
    ['cross-store', order('cross-store', 'pending', {
      merchantId: 'orders-merchant-2', storeId: 'orders-store-2',
    })],
    ['suspended', order('suspended', 'pending', {
      merchantId: 'orders-merchant-suspended', storeId: 'orders-store-suspended',
    })],
    ['customer-forge', order('customer-forge', 'pending')],
    ['refund-valid', order('refund-valid', 'completed', { cashReceived: true })],
    ['refund-valid-delivered', order('refund-valid-delivered', 'delivered')],
    ['refund-invalid', order('refund-invalid', 'pending')],
    ['return-approve', order('return-approve', 'refund_requested', {
      cashReceived: true, returnReason: 'Damaged',
    })],
    ['return-decline', order('return-decline', 'refund_requested', {
      cashReceived: true, returnReason: 'Wrong size',
    })],
    ['return-invalid', order('return-invalid', 'completed', { cashReceived: true })],
    ['cash-valid', order('cash-valid', 'delivered')],
    ['cash-invalid', order('cash-invalid', 'confirmed')],
    ['duplicate', order('duplicate', 'pending')],
    ['direct', order('direct', 'pending')],
    ['admin-valid', order('admin-valid', 'pending')],
    ['admin-suspended', order('admin-suspended', 'pending')],
  ]
  await Promise.all(orders.map(([id, data]) => adminDb.doc(`orders/${id}`).set(data)))
}

before(async () => {
  await seed()
  const identities = [
    ['customer1', 'orders-customer-1', 'orders-customer-1@example.test'],
    ['customer2', 'orders-customer-2', 'orders-customer-2@example.test'],
    ['merchant1', 'orders-merchant-1', 'orders-merchant-1@example.test'],
    ['merchant2', 'orders-merchant-2', 'orders-merchant-2@example.test'],
    ['suspendedMerchant', 'orders-merchant-suspended', 'orders-merchant-suspended@example.test'],
    ['admin', 'orders-admin', 'orders-admin@example.test'],
    ['suspendedAdmin', 'orders-admin-suspended', 'orders-admin-suspended@example.test'],
  ]
  for (const [key, uid, email] of identities) clients[key] = await createClient(uid, email)
})

after(async () => {
  await Promise.all(clientApps.map((app) => deleteApp(app)))
  await deleteAdminApp(adminApp)
})

test('merchant cannot skip pending to delivered', async () => {
  await expectCallableError(
    invoke('transitionOrder', { orderId: 'skip', nextStatus: 'delivered' }, clients.merchant1.token),
    'FAILED_PRECONDITION',
    /cannot transition/i,
  )
  assert.equal((await adminDb.doc('orders/skip').get()).get('status'), 'pending')
})

test('merchant cannot transition another store order', async () => {
  await expectCallableError(
    invoke('transitionOrder', { orderId: 'cross-store', nextStatus: 'confirmed' }, clients.merchant1.token),
    'PERMISSION_DENIED',
    /cannot manage/i,
  )
})

test('suspended merchant cannot transition an owned order', async () => {
  await expectCallableError(
    invoke('transitionOrder', { orderId: 'suspended', nextStatus: 'confirmed' }, clients.suspendedMerchant.token),
    'PERMISSION_DENIED',
    /active account/i,
  )
})

test('customer cannot forge merchant fulfillment transitions', async () => {
  await expectCallableError(
    invoke('transitionOrder', { orderId: 'customer-forge', nextStatus: 'confirmed' }, clients.customer1.token),
    'PERMISSION_DENIED',
    /merchant access/i,
  )
})

test('customer refund request is server-authoritative and only valid after delivery', async () => {
  const result = await invoke(
    'requestOrderRefund',
    { orderId: 'refund-valid', reason: 'Item was damaged' },
    clients.customer1.token,
  )
  assert.equal(result.status, 'refund_requested')
  const valid = (await adminDb.doc('orders/refund-valid').get()).data()
  assert.equal(valid.status, 'refund_requested')
  assert.equal(valid.returnReason, 'Item was damaged')
  assert.equal(valid.timeline.at(-1).status, 'refund_requested')

  const deliveredResult = await invoke(
    'requestOrderRefund',
    { orderId: 'refund-valid-delivered', reason: 'Delivered item was damaged' },
    clients.customer1.token,
  )
  assert.equal(deliveredResult.status, 'refund_requested')

  await expectCallableError(
    invoke(
      'requestOrderRefund',
      { orderId: 'refund-invalid', reason: 'Forged early return' },
      clients.customer1.token,
    ),
    'FAILED_PRECONDITION',
    /after delivery/i,
  )
  await expectCallableError(
    invoke(
      'requestOrderRefund',
      { orderId: 'refund-valid', reason: 'Other customer attempt' },
      clients.customer2.token,
    ),
    'PERMISSION_DENIED',
    /cannot request/i,
  )
})

test('return approval and decline require refund_requested', async () => {
  const approved = await invoke(
    'decideOrderReturn',
    { orderId: 'return-approve', decision: 'approve' },
    clients.merchant1.token,
  )
  assert.equal(approved.status, 'returned')
  assert.equal((await adminDb.doc('orders/return-approve').get()).get('status'), 'returned')

  const declined = await invoke(
    'decideOrderReturn',
    { orderId: 'return-decline', decision: 'decline' },
    clients.merchant1.token,
  )
  assert.equal(declined.status, 'completed')

  await expectCallableError(
    invoke(
      'decideOrderReturn',
      { orderId: 'return-invalid', decision: 'approve' },
      clients.merchant1.token,
    ),
    'FAILED_PRECONDITION',
    /pending refund request/i,
  )
})

test('COD cash confirmation requires an uncollected delivered COD order', async () => {
  const result = await invoke(
    'confirmOrderCash',
    { orderId: 'cash-valid' },
    clients.merchant1.token,
  )
  assert.deepEqual(
    { status: result.status, cashReceived: result.cashReceived },
    { status: 'completed', cashReceived: true },
  )
  const orderAfter = (await adminDb.doc('orders/cash-valid').get()).data()
  assert.equal(orderAfter.timeline.at(-2).status, 'cash_received')
  assert.equal(orderAfter.timeline.at(-1).status, 'completed')

  await expectCallableError(
    invoke('confirmOrderCash', { orderId: 'cash-invalid' }, clients.merchant1.token),
    'FAILED_PRECONDITION',
    /delivered COD order/i,
  )
  await expectCallableError(
    invoke('confirmOrderCash', { orderId: 'cash-valid' }, clients.merchant1.token),
    'FAILED_PRECONDITION',
    /only be confirmed once/i,
  )
})

test('duplicate transition produces no duplicate timeline or activity entry', async () => {
  await invoke(
    'transitionOrder',
    { orderId: 'duplicate', nextStatus: 'confirmed' },
    clients.merchant1.token,
  )
  await expectCallableError(
    invoke(
      'transitionOrder',
      { orderId: 'duplicate', nextStatus: 'confirmed' },
      clients.merchant1.token,
    ),
    'FAILED_PRECONDITION',
    /cannot transition/i,
  )
  const orderAfter = (await adminDb.doc('orders/duplicate').get()).data()
  assert.equal(orderAfter.timeline.filter((entry) => entry.status === 'confirmed').length, 1)
  const activities = await adminDb.collection('activityLogs').where('targetId', '==', 'duplicate').get()
  assert.equal(activities.size, 1)
})

test('browser clients cannot directly mutate lifecycle, financial, timeline, or activity authority', async () => {
  const merchantOrder = doc(clients.merchant1.firestore, 'orders/direct')
  await expectFirestoreDenied(updateDoc(merchantOrder, { status: 'delivered' }))
  await expectFirestoreDenied(updateDoc(merchantOrder, { cashReceived: true, cashReceivedAt: Date.now() }))
  await expectFirestoreDenied(updateDoc(merchantOrder, { paymentStatus: 'paid' }))
  await expectFirestoreDenied(updateDoc(merchantOrder, {
    timeline: [{ status: 'delivered', at: Date.now(), by: 'orders-merchant-1' }],
  }))
  await expectFirestoreDenied(updateDoc(
    doc(clients.customer1.firestore, 'orders/direct'),
    { status: 'refund_requested', returnReason: 'Forged' },
  ))
  await expectFirestoreDenied(updateDoc(doc(clients.admin.firestore, 'orders/direct'), {
    status: 'completed',
  }))
  await expectFirestoreDenied(updateDoc(doc(clients.merchant1.firestore, 'orders/direct'), {
    refundDecision: 'approved',
  }))
  await expectFirestoreDenied(setDoc(doc(clients.merchant1.firestore, 'activityLogs/forged-order'), {
    actorId: 'orders-merchant-1',
    actorName: 'Forged actor',
    actorRole: 'merchant',
    action: 'order.status_changed',
    targetType: 'order',
    targetId: 'direct',
    detail: 'Forged lifecycle activity',
  }))
})

test('active admin retains state-machine authority while suspended admin is rejected', async () => {
  const result = await invoke(
    'transitionOrder',
    { orderId: 'admin-valid', nextStatus: 'confirmed' },
    clients.admin.token,
  )
  assert.equal(result.status, 'confirmed')
  await expectCallableError(
    invoke(
      'transitionOrder',
      { orderId: 'admin-suspended', nextStatus: 'confirmed' },
      clients.suspendedAdmin.token,
    ),
    'PERMISSION_DENIED',
    /active account/i,
  )
  await expectCallableError(
    invoke('confirmOrderCash', { orderId: 'cash-invalid' }, clients.admin.token),
    'PERMISSION_DENIED',
    /merchant access/i,
  )
})
