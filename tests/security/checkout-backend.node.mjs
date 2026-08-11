import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
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
const PASSWORD = 'VendoraCheckout!123'
const callableUrl = `http://${HOST}:${FUNCTIONS_PORT}/${PROJECT_ID}/us-central1/placeOrders`

if (
  PROJECT_ID !== 'demo-vendora-e2e' ||
  HOST !== '127.0.0.1' ||
  process.env.FIRESTORE_EMULATOR_HOST !== `${HOST}:${FIRESTORE_PORT}` ||
  process.env.FIREBASE_AUTH_EMULATOR_HOST !== `${HOST}:${AUTH_PORT}`
) {
  throw new Error('Refusing unsafe trusted-checkout test target.')
}

const adminApp = initializeAdminApp({ projectId: PROJECT_ID }, 'checkout-security-admin')
const adminAuth = getAdminAuth(adminApp)
const adminDb = getAdminFirestore(adminApp)
const clients = []

const address = {
  fullName: 'Checkout Customer',
  phone: '03001234567',
  line1: '27 Emulator Avenue',
  city: 'Lahore',
  province: 'Punjab',
  postalCode: '54000',
  country: 'Pakistan',
}

function product(id, overrides = {}) {
  return {
    storeId: 'checkout-store-1',
    merchantId: 'checkout-merchant-1',
    name: `Product ${id}`,
    images: [`https://example.test/${id}.png`],
    price: 100,
    stock: 10,
    minOrderQty: 1,
    maxOrderQty: 5,
    status: 'approved',
    publiclyVisible: true,
    soldCount: 0,
    ...overrides,
  }
}

function coupon(code, overrides = {}) {
  return {
    code,
    type: 'percentage',
    value: 20,
    usedCount: 0,
    active: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  }
}

function intent(items, idempotencyKey, overrides = {}) {
  return {
    items,
    delivery: {
      fullName: address.fullName,
      email: 'checkout-customer-1@example.test',
      phone: address.phone,
      address,
    },
    paymentMethod: 'cod',
    idempotencyKey,
    ...overrides,
  }
}

function idempotencyKeyHash(value) {
  return createHash('sha256').update(value).digest('hex')
}

async function createClient(uid, email) {
  const app = initializeApp(
    { apiKey: 'demo-key', projectId: PROJECT_ID, authDomain: `${PROJECT_ID}.firebaseapp.com` },
    `checkout-${uid}`,
  )
  clients.push(app)
  const auth = getAuth(app)
  connectAuthEmulator(auth, `http://${HOST}:${AUTH_PORT}`, { disableWarnings: true })
  const credential = await signInWithEmailAndPassword(auth, email, PASSWORD)
  const firestore = getFirestore(app)
  connectFirestoreEmulator(firestore, HOST, FIRESTORE_PORT)
  return {
    auth,
    firestore,
    token: await credential.user.getIdToken(),
  }
}

async function invokeCheckout(data, token) {
  const response = await fetch(callableUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
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

async function expectCheckoutError(promise, status, messagePattern) {
  await assert.rejects(promise, (error) => error.status === status && messagePattern.test(error.message))
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
    ['checkout-customer-1', 'checkout-customer-1@example.test', 'customer'],
    ['checkout-customer-2', 'checkout-customer-2@example.test', 'customer'],
    ['checkout-customer-suspended', 'checkout-suspended@example.test', 'customer'],
    ['checkout-merchant-1', 'checkout-merchant-1@example.test', 'merchant'],
    ['checkout-merchant-2', 'checkout-merchant-2@example.test', 'merchant'],
  ]
  for (const [uid, email] of users) {
    await adminAuth.createUser({ uid, email, password: PASSWORD })
    await adminDb.doc(`users/${uid}`).set({
      email,
      displayName: uid,
      role: users.find((entry) => entry[0] === uid)[2],
      ...(uid === 'checkout-customer-suspended' ? { suspended: true } : {}),
    })
  }

  await Promise.all([
    adminDb.doc('stores/checkout-store-1').set({
      ownerId: 'checkout-merchant-1',
      name: 'Checkout Store One',
      status: 'approved',
      shippingEnabled: true,
      shippingFee: 10,
      freeShippingThreshold: 250,
    }),
    adminDb.doc('stores/checkout-store-2').set({
      ownerId: 'checkout-merchant-2',
      name: 'Checkout Store Two',
      status: 'approved',
      shippingEnabled: true,
      shippingFee: 5,
      freeShippingThreshold: 0,
    }),
  ])

  const products = [
    ['valid', product('valid')],
    ['forged', product('forged', { price: 120 })],
    ['stale', product('stale', { stock: 0 })],
    ['atomic-good', product('atomic-good', { price: 30, stock: 5 })],
    ['atomic-bad', product('atomic-bad', { price: 40, stock: 0 })],
    ['replay', product('replay', { price: 75, stock: 3 })],
    ['concurrent-replay', product('concurrent-replay', { price: 55, stock: 2 })],
    ['cross-user-replay', product('cross-user-replay', { price: 65, stock: 2 })],
    ['suspended-replay', product('suspended-replay', { price: 45, stock: 2 })],
    ['global-a', product('global-a', { price: 100, stock: 5 })],
    ['global-b', product('global-b', { price: 100, stock: 5 })],
    ['per-customer', product('per-customer', { price: 100, stock: 5 })],
    ['stale-coupon', product('stale-coupon', { price: 100, stock: 5 })],
    ['multi-one', product('multi-one', { price: 200, stock: 5 })],
    [
      'multi-two',
      product('multi-two', {
        storeId: 'checkout-store-2',
        merchantId: 'checkout-merchant-2',
        price: 80,
        stock: 5,
      }),
    ],
  ]
  await Promise.all(products.map(([id, data]) => adminDb.doc(`products/${id}`).set(data)))
  await Promise.all([
    adminDb.doc('coupons/global-one').set(coupon('GLOBALONE', { usageLimit: 1 })),
    adminDb.doc('coupons/customer-one').set(coupon('CUSTOMERONE', { usageLimit: 10, perCustomerLimit: 1 })),
    adminDb.doc('coupons/stale-checkout').set(coupon('STALECHECK', { active: false })),
    adminDb
      .doc('coupons/multi-cap')
      .set(coupon('MULTI20', { maxDiscount: 30, usageLimit: 10, perCustomerLimit: 2 })),
  ])
}

let customerOne
let customerTwo
let merchantOne
let suspendedCustomer

before(async () => {
  await seed()
  customerOne = await createClient('checkout-customer-1', 'checkout-customer-1@example.test')
  customerTwo = await createClient('checkout-customer-2', 'checkout-customer-2@example.test')
  merchantOne = await createClient('checkout-merchant-1', 'checkout-merchant-1@example.test')
  suspendedCustomer = await createClient('checkout-customer-suspended', 'checkout-suspended@example.test')
})

after(async () => {
  await Promise.all(clients.map((app) => deleteApp(app)))
  await deleteAdminApp(adminApp)
})

test('unauthenticated checkout is denied', async () => {
  await expectCheckoutError(
    invokeCheckout(intent([{ productId: 'valid', quantity: 1 }], 'unauthenticated-1')),
    'UNAUTHENTICATED',
    /signed in/i,
  )
})

test('wrong-role and suspended accounts are denied before checkout work', async () => {
  await expectCheckoutError(
    invokeCheckout(
      intent([{ productId: 'valid', quantity: 1 }], 'merchant-role-denied-1'),
      merchantOne.token,
    ),
    'PERMISSION_DENIED',
    /account cannot place orders/i,
  )
  await expectCheckoutError(
    invokeCheckout(
      intent([{ productId: 'valid', quantity: 1 }], 'suspended-denied-1'),
      suspendedCustomer.token,
    ),
    'PERMISSION_DENIED',
    /account cannot place orders/i,
  )
})

test('request shape, identifier, quantity, and payload bounds reject abuse safely', async () => {
  const invalidCases = [
    [intent([{ productId: 'valid', quantity: 0 }], 'invalid-zero-quantity'), /quantity/i],
    [intent([{ productId: 'valid', quantity: 1_001 }], 'invalid-large-quantity'), /quantity/i],
    [intent([{ productId: 'invalid/product', quantity: 1 }], 'invalid-product-path'), /product/i],
    [intent([{ productId: 'valid', quantity: 1 }], 'invalid/key/path'), /request ID/i],
    [
      intent([{ productId: 'valid', quantity: 1 }], 'missing-delivery-1', {
        delivery: { fullName: 'Only a name' },
      }),
      /delivery/i,
    ],
    [
      intent([{ productId: 'valid', quantity: 1 }], 'invalid-email-1', {
        delivery: {
          fullName: address.fullName,
          email: 'not-an-email',
          phone: address.phone,
          address,
        },
      }),
      /email/i,
    ],
    [
      intent([{ productId: 'valid', quantity: 1 }], 'oversized-payload-1', {
        ignored: 'x'.repeat(70 * 1024),
      }),
      /too large/i,
    ],
  ]

  for (const [checkoutIntent, message] of invalidCases) {
    await expectCheckoutError(invokeCheckout(checkoutIntent, customerOne.token), 'INVALID_ARGUMENT', message)
  }
})

test('server owns customer identity and every financial field', async () => {
  const result = await invokeCheckout(
    intent([{ productId: 'forged', quantity: 2 }], 'forged-financials-1', {
      customerId: 'checkout-customer-2',
      merchantId: 'checkout-merchant-2',
      storeId: 'checkout-store-2',
      price: 0.01,
      subtotal: 0.02,
      discount: 999,
      shippingFee: 0,
      total: 0,
      soldCount: 999,
    }),
    customerOne.token,
  )
  assert.equal(result.orderIds.length, 1)
  const order = (await adminDb.doc(`orders/${result.orderIds[0]}`).get()).data()
  assert.deepEqual(
    {
      customerId: order.customerId,
      merchantId: order.merchantId,
      storeId: order.storeId,
      itemPrice: order.items[0].price,
      subtotal: order.subtotal,
      discount: order.discount,
      shippingFee: order.shippingFee,
      total: order.total,
    },
    {
      customerId: 'checkout-customer-1',
      merchantId: 'checkout-merchant-1',
      storeId: 'checkout-store-1',
      itemPrice: 120,
      subtotal: 240,
      discount: 0,
      shippingFee: 10,
      total: 250,
    },
  )
  const productState = (await adminDb.doc('products/forged').get()).data()
  assert.equal(productState.stock, 8)
  assert.equal(productState.soldCount, 2)
})

test('stale stock and multi-item partial failure create no side effects', async () => {
  await expectCheckoutError(
    invokeCheckout(intent([{ productId: 'stale', quantity: 1 }], 'stale-stock-1'), customerOne.token),
    'FAILED_PRECONDITION',
    /unavailable|stock changed/i,
  )
  await expectCheckoutError(
    invokeCheckout(
      intent(
        [
          { productId: 'atomic-good', quantity: 1 },
          { productId: 'atomic-bad', quantity: 1 },
        ],
        'atomic-failure-1',
      ),
      customerOne.token,
    ),
    'FAILED_PRECONDITION',
    /unavailable|stock changed/i,
  )
  assert.deepEqual(
    (await adminDb.doc('products/atomic-good').get()).data(),
    product('atomic-good', { price: 30, stock: 5 }),
  )
  const failedRequests = await adminDb
    .collection('checkoutRequests')
    .where('customerId', '==', 'checkout-customer-1')
    .get()
  assert.equal(
    failedRequests.docs.some(
      (item) => item.get('idempotencyKeyHash') === idempotencyKeyHash('atomic-failure-1'),
    ),
    false,
  )
})

test('trusted checkout rejects products from a non-operational store without side effects', async () => {
  const storeRef = adminDb.doc('stores/checkout-store-1')
  const productRef = adminDb.doc('products/valid')
  const beforeProduct = (await productRef.get()).data()
  const requestKey = 'suspended-store-denied-1'

  await storeRef.update({ status: 'suspended' })
  try {
    await expectCheckoutError(
      invokeCheckout(intent([{ productId: 'valid', quantity: 1 }], requestKey), customerOne.token),
      'FAILED_PRECONDITION',
      /stores are unavailable/i,
    )
    const [afterProduct, checkoutRequests] = await Promise.all([
      productRef.get(),
      adminDb.collection('checkoutRequests')
        .where('customerId', '==', 'checkout-customer-1')
        .get(),
    ])
    assert.equal(afterProduct.data().stock, beforeProduct.stock)
    assert.equal(afterProduct.data().soldCount, beforeProduct.soldCount)
    assert.equal(
      checkoutRequests.docs.some(
        (item) => item.get('idempotencyKeyHash') === idempotencyKeyHash(requestKey),
      ),
      false,
    )
  } finally {
    await storeRef.update({ status: 'approved' })
  }
})

test('idempotency makes exact replay safe and rejects key reuse with different intent', async () => {
  const checkoutIntent = intent([{ productId: 'replay', quantity: 1 }], 'replay-request-1')
  const first = await invokeCheckout(checkoutIntent, customerOne.token)
  const replay = await invokeCheckout(checkoutIntent, customerOne.token)
  assert.deepEqual(replay, first)
  const forgedReplay = await invokeCheckout(
    { ...checkoutIntent, customerId: 'someone-else', total: 0, price: 0 },
    customerOne.token,
  )
  assert.deepEqual(forgedReplay, first)
  await expectCheckoutError(
    invokeCheckout(intent([{ productId: 'replay', quantity: 2 }], 'replay-request-1'), customerOne.token),
    'ALREADY_EXISTS',
    /already been used/i,
  )
  const state = (await adminDb.doc('products/replay').get()).data()
  assert.equal(state.stock, 2)
  assert.equal(state.soldCount, 1)

  const requestRecord = await adminDb
    .collection('checkoutRequests')
    .where('idempotencyKeyHash', '==', idempotencyKeyHash('replay-request-1'))
    .get()
  assert.equal(requestRecord.size, 1)
  const expiresAt = requestRecord.docs[0].get('expiresAt').toMillis()
  const retentionDays = (expiresAt - Date.now()) / (24 * 60 * 60 * 1_000)
  assert.ok(retentionDays > 29.9 && retentionDays <= 30)
})

test('concurrent duplicate requests create one order and one inventory change', async () => {
  const checkoutIntent = intent(
    [{ productId: 'concurrent-replay', quantity: 1 }],
    'concurrent-replay-request-1',
  )
  const [first, second] = await Promise.all([
    invokeCheckout(checkoutIntent, customerOne.token),
    invokeCheckout(checkoutIntent, customerOne.token),
  ])
  assert.deepEqual(second, first)
  assert.equal(new Set([...first.orderIds, ...second.orderIds]).size, 1)
  const state = (await adminDb.doc('products/concurrent-replay').get()).data()
  assert.equal(state.stock, 1)
  assert.equal(state.soldCount, 1)
})

test('idempotency keys are isolated by authenticated customer', async () => {
  const key = 'shared-literal-request-key'
  const first = await invokeCheckout(
    intent([{ productId: 'cross-user-replay', quantity: 1 }], key),
    customerOne.token,
  )
  const second = await invokeCheckout(
    intent([{ productId: 'cross-user-replay', quantity: 1 }], key, {
      delivery: {
        fullName: 'Checkout Customer Two',
        email: 'checkout-customer-2@example.test',
        phone: address.phone,
        address: { ...address, fullName: 'Checkout Customer Two' },
      },
    }),
    customerTwo.token,
  )
  assert.notDeepEqual(second, first)
  const orders = await Promise.all(
    [first.orderIds[0], second.orderIds[0]].map(async (id) =>
      (await adminDb.doc(`orders/${id}`).get()).data(),
    ),
  )
  assert.deepEqual(orders.map((order) => order.customerId).sort(), [
    'checkout-customer-1',
    'checkout-customer-2',
  ])
  const records = await adminDb
    .collection('checkoutRequests')
    .where('idempotencyKeyHash', '==', idempotencyKeyHash(key))
    .get()
  assert.equal(records.size, 2)
})

test('current suspension is enforced before replaying a successful result', async () => {
  const checkoutIntent = intent([{ productId: 'suspended-replay', quantity: 1 }], 'suspended-after-success-1')
  const first = await invokeCheckout(checkoutIntent, customerOne.token)
  await adminDb.doc('users/checkout-customer-1').update({ suspended: true })
  try {
    await expectCheckoutError(
      invokeCheckout(checkoutIntent, customerOne.token),
      'PERMISSION_DENIED',
      /account cannot place orders/i,
    )
  } finally {
    await adminDb.doc('users/checkout-customer-1').update({ suspended: false })
  }
  assert.equal(first.orderIds.length, 1)
  const state = (await adminDb.doc('products/suspended-replay').get()).data()
  assert.equal(state.stock, 1)
  assert.equal(state.soldCount, 1)
})

test('coupon state and global usage limit are transactionally revalidated', async () => {
  await expectCheckoutError(
    invokeCheckout(
      intent([{ productId: 'stale-coupon', quantity: 1 }], 'stale-coupon-1', {
        couponCode: 'STALECHECK',
      }),
      customerOne.token,
    ),
    'FAILED_PRECONDITION',
    /not valid/i,
  )

  const attempts = await Promise.allSettled([
    invokeCheckout(
      intent([{ productId: 'global-a', quantity: 1 }], 'global-limit-customer-1', {
        couponCode: 'GLOBALONE',
      }),
      customerOne.token,
    ),
    invokeCheckout(
      intent([{ productId: 'global-b', quantity: 1 }], 'global-limit-customer-2', {
        couponCode: 'GLOBALONE',
        delivery: {
          fullName: 'Checkout Customer Two',
          email: 'checkout-customer-2@example.test',
          phone: address.phone,
          address: { ...address, fullName: 'Checkout Customer Two' },
        },
      }),
      customerTwo.token,
    ),
  ])
  assert.equal(attempts.filter((attempt) => attempt.status === 'fulfilled').length, 1)
  assert.equal(attempts.filter((attempt) => attempt.status === 'rejected').length, 1)
  assert.equal((await adminDb.doc('coupons/global-one').get()).get('usedCount'), 1)
})

test('per-customer usage limit is atomic across concurrent requests', async () => {
  const attempts = await Promise.allSettled([
    invokeCheckout(
      intent([{ productId: 'per-customer', quantity: 1 }], 'per-customer-a', {
        couponCode: 'CUSTOMERONE',
      }),
      customerOne.token,
    ),
    invokeCheckout(
      intent([{ productId: 'per-customer', quantity: 1 }], 'per-customer-b', {
        couponCode: 'CUSTOMERONE',
      }),
      customerOne.token,
    ),
  ])
  assert.equal(attempts.filter((attempt) => attempt.status === 'fulfilled').length, 1)
  assert.equal(attempts.filter((attempt) => attempt.status === 'rejected').length, 1)
  assert.equal(
    (await adminDb.doc('customerCouponUsages/customer-one_checkout-customer-1').get()).get('count'),
    1,
  )
})

test('multi-store checkout creates separate orders with exact shared allocation', async () => {
  const result = await invokeCheckout(
    intent(
      [
        { productId: 'multi-one', quantity: 1 },
        { productId: 'multi-two', quantity: 1 },
      ],
      'multi-store-1',
      { couponCode: 'MULTI20' },
    ),
    customerOne.token,
  )
  assert.equal(result.orderIds.length, 2)
  const orders = await Promise.all(
    result.orderIds.map(async (id) => (await adminDb.doc(`orders/${id}`).get()).data()),
  )
  const first = orders.find((order) => order.storeId === 'checkout-store-1')
  const second = orders.find((order) => order.storeId === 'checkout-store-2')
  assert.deepEqual(
    { subtotal: first.subtotal, discount: first.discount, shipping: first.shippingFee, total: first.total },
    { subtotal: 200, discount: 21.43, shipping: 10, total: 188.57 },
  )
  assert.deepEqual(
    {
      subtotal: second.subtotal,
      discount: second.discount,
      shipping: second.shippingFee,
      total: second.total,
    },
    { subtotal: 80, discount: 8.57, shipping: 5, total: 76.43 },
  )
  assert.equal((await adminDb.doc('coupons/multi-cap').get()).get('usedCount'), 1)
})

test('customer Firestore writes cannot create orders or mutate financial authority', async () => {
  await assert.rejects(
    setDoc(doc(customerOne.firestore, 'checkoutRequests/direct-forgery'), {
      customerId: 'checkout-customer-1',
      result: { orderIds: ['forged'] },
    }),
    /permission-denied/i,
  )

  await assert.rejects(
    setDoc(doc(customerOne.firestore, 'orders/direct-forgery'), {
      customerId: 'checkout-customer-1',
      subtotal: 1,
      discount: 0,
      shippingFee: 0,
      tax: 0,
      total: 1,
      paymentMethod: 'cod',
      status: 'pending',
      cashReceived: false,
      items: [{ productId: 'valid', price: 1, quantity: 1 }],
    }),
    /permission-denied/i,
  )

  const validCheckout = await invokeCheckout(
    intent([{ productId: 'valid', quantity: 1 }], 'rules-valid-order-1'),
    customerOne.token,
  )
  const orderRef = doc(customerOne.firestore, `orders/${validCheckout.orderIds[0]}`)
  await assert.rejects(updateDoc(orderRef, { total: 0, subtotal: 0 }), /permission-denied/i)
  await assert.rejects(
    updateDoc(doc(customerOne.firestore, 'products/valid'), { stock: 999, soldCount: 0 }),
    /permission-denied/i,
  )
  await assert.rejects(
    setDoc(doc(customerOne.firestore, 'couponUsages/direct-forgery'), {
      customerId: 'checkout-customer-1',
    }),
    /permission-denied/i,
  )
  await assert.rejects(
    setDoc(doc(customerOne.firestore, 'customerCouponUsages/direct-forgery'), {
      customerId: 'checkout-customer-1',
    }),
    /permission-denied/i,
  )
})
