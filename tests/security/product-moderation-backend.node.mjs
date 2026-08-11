import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { after, before, test } from 'node:test'

import { deleteApp as deleteAdminApp, initializeApp as initializeAdminApp } from 'firebase-admin/app'
import { getAuth as getAdminAuth } from 'firebase-admin/auth'
import { getFirestore as getAdminFirestore } from 'firebase-admin/firestore'
import { deleteApp, initializeApp } from 'firebase/app'
import { connectAuthEmulator, getAuth, signInWithEmailAndPassword } from 'firebase/auth'
import {
  collection,
  connectFirestoreEmulator,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore'

const PROJECT_ID = 'demo-vendora-e2e'
const HOST = '127.0.0.1'
const AUTH_PORT = 9099
const FIRESTORE_PORT = 8080
const FUNCTIONS_PORT = 5001
const PASSWORD = 'VendoraProducts!123'
const checkoutUrl = `http://${HOST}:${FUNCTIONS_PORT}/${PROJECT_ID}/us-central1/placeOrders`

if (
  PROJECT_ID !== 'demo-vendora-e2e' ||
  HOST !== '127.0.0.1' ||
  process.env.FIRESTORE_EMULATOR_HOST !== `${HOST}:${FIRESTORE_PORT}` ||
  process.env.FIREBASE_AUTH_EMULATOR_HOST !== `${HOST}:${AUTH_PORT}`
) {
  throw new Error('Refusing unsafe product-moderation test target.')
}

const adminApp = initializeAdminApp({ projectId: PROJECT_ID }, 'product-moderation-admin')
const adminAuth = getAdminAuth(adminApp)
const adminDb = getAdminFirestore(adminApp)
adminDb.settings({ ignoreUndefinedProperties: true })
const apps = []
const clients = {}

function product(id, merchantId = 'product-merchant', storeId = 'product-store', overrides = {}) {
  const now = Date.now()
  return {
    storeId,
    merchantId,
    name: `Moderated ${id}`,
    slug: `moderated-${id}`,
    description: 'An emulator-only product used to verify product reapproval security.',
    images: [`https://example.test/${id}.png`],
    price: 100,
    compareAtPrice: null,
    currency: 'USD',
    sku: `MOD-${id}`,
    stock: 10,
    lowStockThreshold: 2,
    minOrderQty: 1,
    maxOrderQty: 5,
    categoryId: 'moderation-category',
    tags: ['moderation'],
    status: 'approved',
    publiclyVisible: true,
    rejectionReason: '',
    featured: false,
    trending: false,
    recommended: false,
    flashSale: null,
    rating: 0,
    ratingCount: 0,
    ratingSum: 0,
    soldCount: 0,
    viewCount: 0,
    createdAt: now,
    updatedAt: now,
    publishedAt: now,
    ...overrides,
  }
}

async function createClient(uid, email) {
  const app = initializeApp(
    { apiKey: 'demo-key', projectId: PROJECT_ID, authDomain: `${PROJECT_ID}.firebaseapp.com` },
    `product-moderation-${uid}`,
  )
  apps.push(app)
  const auth = getAuth(app)
  connectAuthEmulator(auth, `http://${HOST}:${AUTH_PORT}`, { disableWarnings: true })
  const credential = await signInWithEmailAndPassword(auth, email, PASSWORD)
  const firestore = getFirestore(app)
  connectFirestoreEmulator(firestore, HOST, FIRESTORE_PORT)
  return { firestore, token: await credential.user.getIdToken() }
}

async function invokeCheckout(productId, token) {
  const response = await fetch(checkoutUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      data: {
        items: [{ productId, quantity: 1 }],
        delivery: {
          fullName: 'Moderation Customer',
          email: 'product-customer@example.test',
          phone: '03001234567',
          address: {
            fullName: 'Moderation Customer',
            phone: '03001234567',
            line1: '27 Emulator Avenue',
            city: 'Lahore',
            province: 'Punjab',
            postalCode: '54000',
            country: 'Pakistan',
          },
        },
        paymentMethod: 'cod',
        idempotencyKey: randomUUID(),
      },
    }),
  })
  return response.json()
}

async function waitForProduct(id, predicate, timeout = 10_000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    const snapshot = await adminDb.doc(`products/${id}`).get()
    if (snapshot.exists && predicate(snapshot.data())) return snapshot.data()
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error(`Timed out waiting for products/${id}.`)
}

before(async () => {
  await fetch(
    `http://${HOST}:${FIRESTORE_PORT}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`,
    { method: 'DELETE' },
  )
  await fetch(`http://${HOST}:${AUTH_PORT}/emulator/v1/projects/${PROJECT_ID}/accounts`, {
    method: 'DELETE',
  })

  const users = [
    ['product-merchant', 'product-merchant@example.test', 'merchant', false, 'product-store'],
    ['other-merchant', 'other-merchant@example.test', 'merchant', false, 'other-store'],
    ['suspended-merchant', 'suspended-merchant@example.test', 'merchant', true, 'suspended-store'],
    ['product-admin', 'product-admin@example.test', 'admin', false, undefined],
    ['product-customer', 'product-customer@example.test', 'customer', false, undefined],
  ]
  for (const [uid, email, role, suspended, storeId] of users) {
    await adminAuth.createUser({ uid, email, password: PASSWORD })
    await adminDb.doc(`users/${uid}`).set({
      email,
      displayName: uid,
      role,
      suspended,
      ...(storeId ? { storeId } : {}),
    })
  }

  await Promise.all([
    adminDb.doc('stores/product-store').set({
      ownerId: 'product-merchant', name: 'Product Store', status: 'approved',
      shippingEnabled: false, shippingFee: 0,
    }),
    adminDb.doc('stores/other-store').set({
      ownerId: 'other-merchant', name: 'Other Store', status: 'approved',
    }),
    adminDb.doc('stores/suspended-store').set({
      ownerId: 'suspended-merchant', name: 'Suspended Owner Store', status: 'approved',
    }),
  ])

  const fixtures = {
    approved: product('approved'),
    stock: product('stock'),
    price: product('price'),
    content: product('content'),
    lifecycle: product('lifecycle'),
    draft: product('draft', 'product-merchant', 'product-store', {
      status: 'draft', publiclyVisible: false, rejectionReason: '', publishedAt: undefined,
    }),
    pending: product('pending', 'product-merchant', 'product-store', {
      status: 'pending', publiclyVisible: false, rejectionReason: '', publishedAt: undefined,
    }),
    other: product('other', 'other-merchant', 'other-store'),
    suspended: product('suspended', 'suspended-merchant', 'suspended-store'),
  }
  await Promise.all(Object.entries(fixtures).map(([id, data]) => adminDb.doc(`products/${id}`).set(data)))

  clients.merchant = await createClient('product-merchant', 'product-merchant@example.test')
  clients.other = await createClient('other-merchant', 'other-merchant@example.test')
  clients.suspended = await createClient('suspended-merchant', 'suspended-merchant@example.test')
  clients.admin = await createClient('product-admin', 'product-admin@example.test')
  clients.customer = await createClient('product-customer', 'product-customer@example.test')
  const anonymousApp = initializeApp(
    { apiKey: 'demo-key', projectId: PROJECT_ID },
    'product-moderation-anonymous',
  )
  apps.push(anonymousApp)
  clients.anonymous = { firestore: getFirestore(anonymousApp) }
  connectFirestoreEmulator(clients.anonymous.firestore, HOST, FIRESTORE_PORT)
})

after(async () => {
  await Promise.all(apps.map((app) => deleteApp(app)))
  await deleteAdminApp(adminApp)
})

test('public visibility, draft/pending edits, ownership, and suspension rules are enforced', async () => {
  const publicSnapshot = await getDoc(doc(clients.anonymous.firestore, 'products/approved'))
  assert.equal(publicSnapshot.exists(), true)
  const publicQuery = await getDocs(query(
    collection(clients.anonymous.firestore, 'products'),
    where('status', '==', 'approved'),
    where('publiclyVisible', '==', true),
  ))
  assert.ok(publicQuery.docs.some((item) => item.id === 'approved'))

  await updateDoc(doc(clients.merchant.firestore, 'products/draft'), {
    description: 'A legitimate merchant edit to an existing draft product.',
    updatedAt: serverTimestamp(),
  })
  await updateDoc(doc(clients.merchant.firestore, 'products/pending'), {
    description: 'A legitimate merchant edit while the product remains pending.',
    updatedAt: serverTimestamp(),
  })
  await assert.rejects(updateDoc(doc(clients.merchant.firestore, 'products/other'), {
    stock: 11, updatedAt: serverTimestamp(),
  }))
  await assert.rejects(updateDoc(doc(clients.suspended.firestore, 'products/suspended'), {
    stock: 11, updatedAt: serverTimestamp(),
  }))
})

test('merchant cannot retain or forge moderation authority', async () => {
  const ref = doc(clients.merchant.firestore, 'products/approved')
  await assert.rejects(updateDoc(ref, {
    name: 'Bypassed approved name', updatedAt: serverTimestamp(),
  }))
  await assert.rejects(updateDoc(ref, {
    price: 1, status: 'approved', publiclyVisible: true, updatedAt: serverTimestamp(),
  }))
  await assert.rejects(updateDoc(doc(clients.merchant.firestore, 'products/draft'), {
    status: 'approved', updatedAt: serverTimestamp(),
  }))
  await assert.rejects(updateDoc(doc(clients.merchant.firestore, 'products/draft'), {
    publiclyVisible: true, updatedAt: serverTimestamp(),
  }))
  await assert.rejects(updateDoc(ref, {
    publishedAt: serverTimestamp(), updatedAt: serverTimestamp(),
  }))
  await assert.rejects(updateDoc(ref, {
    rejectionReason: 'Forged admin note', updatedAt: serverTimestamp(),
  }))
})

test('inventory-only edits stay approved while price and content/image edits require reapproval', async () => {
  await updateDoc(doc(clients.merchant.firestore, 'products/stock'), {
    stock: 12, lowStockThreshold: 3, updatedAt: serverTimestamp(),
  })
  const stock = await getDoc(doc(clients.merchant.firestore, 'products/stock'))
  assert.equal(stock.data().status, 'approved')
  assert.equal(stock.data().publiclyVisible, true)

  await updateDoc(doc(clients.merchant.firestore, 'products/price'), {
    price: 125, status: 'pending', publiclyVisible: false,
    rejectionReason: '', updatedAt: serverTimestamp(),
  })
  const price = await getDoc(doc(clients.merchant.firestore, 'products/price'))
  assert.equal(price.data().status, 'pending')
  await assert.rejects(getDoc(doc(clients.anonymous.firestore, 'products/price')))

  await updateDoc(doc(clients.merchant.firestore, 'products/content'), {
    description: 'Changed moderated content that now needs another administrator review.',
    images: ['https://example.test/content-v2.png'],
    status: 'pending', publiclyVisible: false,
    rejectionReason: '', updatedAt: serverTimestamp(),
  })
  const content = await getDoc(doc(clients.merchant.firestore, 'products/content'))
  assert.equal(content.data().status, 'pending')
  assert.equal(content.data().publiclyVisible, false)
})

test('pending checkout is rejected, admin reapproval republishes, and order snapshots remain unchanged', async () => {
  const orderSnapshot = {
    orderNumber: 'VND-MODERATION',
    customerId: 'product-customer',
    merchantId: 'product-merchant',
    storeId: 'product-store',
    items: [{ productId: 'lifecycle', name: 'Historical product name', price: 100, quantity: 1 }],
    subtotal: 100,
    total: 100,
    status: 'pending',
  }
  await adminDb.doc('orders/historical-order').set(orderSnapshot)

  await updateDoc(doc(clients.merchant.firestore, 'products/lifecycle'), {
    name: 'Lifecycle product v2', price: 130,
    status: 'pending', publiclyVisible: false,
    rejectionReason: '', updatedAt: serverTimestamp(),
  })
  const rejectedCheckout = await invokeCheckout('lifecycle', clients.customer.token)
  assert.equal(rejectedCheckout.error?.status, 'FAILED_PRECONDITION')

  await updateDoc(doc(clients.admin.firestore, 'products/lifecycle'), {
    status: 'approved', rejectionReason: '', publishedAt: serverTimestamp(), updatedAt: serverTimestamp(),
  })
  const republished = await waitForProduct(
    'lifecycle',
    (value) => value.status === 'approved' && value.publiclyVisible === true,
  )
  assert.equal(republished.name, 'Lifecycle product v2')
  const publicSnapshot = await getDoc(doc(clients.anonymous.firestore, 'products/lifecycle'))
  assert.equal(publicSnapshot.exists(), true)

  const historical = (await adminDb.doc('orders/historical-order').get()).data()
  assert.deepEqual(historical.items, orderSnapshot.items)
  assert.equal(historical.total, 100)
})
