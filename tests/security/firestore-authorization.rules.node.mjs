import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { readFile } from 'node:fs/promises'

import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing'
import {
  Timestamp,
  collection,
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

let env
const clients = {}

function profile(role, overrides = {}) {
  return {
    email: `${role}@example.test`,
    displayName: `${role} user`,
    role,
    suspended: false,
    createdAt: FIXED_TIME,
    updatedAt: FIXED_TIME,
    ...overrides,
  }
}

function store(ownerId, status, overrides = {}) {
  return {
    ownerId,
    name: `${status} store`,
    slug: `${status}-${ownerId}`,
    description: 'A rules-emulator store profile with public information only.',
    status,
    verified: false,
    rating: 0,
    ratingCount: 0,
    productCount: 0,
    totalSales: 0,
    createdAt: FIXED_TIME,
    updatedAt: FIXED_TIME,
    ...overrides,
  }
}

function application(storeId, ownerId, status, overrides = {}) {
  return {
    storeId,
    ownerId,
    email: `${ownerId}@merchant.test`,
    phone: '03001234567',
    address: '27 Private Emulator Avenue',
    businessName: `${ownerId} Legal Business`,
    businessDocumentUrl: 'data:application/pdf;base64,cHJpdmF0ZQ==',
    status,
    rejectionReason: status === 'rejected' ? 'Document was unreadable.' : '',
    createdAt: FIXED_TIME,
    updatedAt: FIXED_TIME,
    ...overrides,
  }
}

function product(storeId, merchantId, overrides = {}) {
  return {
    storeId,
    merchantId,
    name: 'Rules product',
    status: 'approved',
    publiclyVisible: true,
    rating: 0,
    ratingCount: 0,
    ratingSum: 0,
    soldCount: 0,
    viewCount: 0,
    createdAt: FIXED_TIME,
    updatedAt: FIXED_TIME,
    ...overrides,
  }
}

async function seed() {
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore()
    await Promise.all([
      setDoc(doc(db, 'users/customer-active'), profile('customer')),
      setDoc(doc(db, 'users/customer-other'), profile('customer')),
      setDoc(doc(db, 'users/customer-suspended'), profile('customer', { suspended: true })),
      setDoc(doc(db, 'users/applicant-rejected'), profile('customer')),
      setDoc(doc(db, 'users/merchant-active'), profile('merchant', { storeId: 'store-approved' })),
      setDoc(doc(db, 'users/merchant-other'), profile('merchant', { storeId: 'store-other' })),
      setDoc(doc(db, 'users/merchant-suspended'), profile('merchant', { suspended: true, storeId: 'store-suspended-user' })),
      setDoc(doc(db, 'users/merchant-pending'), profile('merchant', { storeId: 'store-pending' })),
      setDoc(doc(db, 'users/merchant-rejected'), profile('merchant', { storeId: 'store-rejected' })),
      setDoc(doc(db, 'users/admin-active'), profile('admin')),
      setDoc(doc(db, 'users/admin-suspended'), profile('admin', { suspended: true })),
      setDoc(doc(db, 'stores/store-approved'), store('merchant-active', 'approved')),
      setDoc(doc(db, 'publicStores/store-approved'), store('merchant-active', 'approved')),
      setDoc(doc(db, 'stores/store-other'), store('merchant-other', 'approved')),
      setDoc(doc(db, 'stores/store-suspended-user'), store('merchant-suspended', 'approved')),
      setDoc(doc(db, 'stores/store-pending'), store('merchant-pending', 'pending')),
      setDoc(doc(db, 'stores/store-rejected'), store('merchant-rejected', 'rejected')),
      setDoc(doc(db, 'stores/store-suspended'), store('merchant-other', 'suspended')),
      setDoc(doc(db, 'stores/application-rejected'), store('applicant-rejected', 'rejected')),
      setDoc(doc(db, 'stores/store-legacy-sensitive'), store('merchant-other', 'approved', {
        email: 'leaked@example.test',
        phone: '03000000000',
        address: 'Private address',
        businessDocumentUrl: 'data:application/pdf;base64,bGVhaw==',
        rejectionReason: 'Private moderation note',
      })),
      setDoc(doc(db, 'merchantApplications/store-approved'), application('store-approved', 'merchant-active', 'approved')),
      setDoc(doc(db, 'merchantApplications/store-other'), application('store-other', 'merchant-other', 'approved')),
      setDoc(doc(db, 'merchantApplications/application-rejected'), application('application-rejected', 'applicant-rejected', 'rejected')),
      setDoc(doc(db, 'products/product-public'), product('store-approved', 'merchant-active')),
      setDoc(doc(db, 'products/product-material-edit'), product('store-approved', 'merchant-active')),
      setDoc(doc(db, 'products/product-other'), product('store-other', 'merchant-other')),
      setDoc(doc(db, 'products/product-suspended-store'), product('store-suspended', 'merchant-other', { publiclyVisible: false })),
      setDoc(doc(db, 'users/customer-suspended/addresses/home'), {
        label: 'Home', fullName: 'Suspended Customer', phone: '03001234567',
        line1: '27 Emulator Avenue', city: 'Lahore', province: 'Punjab',
        postalCode: '54000', country: 'Pakistan', createdAt: FIXED_TIME, updatedAt: FIXED_TIME,
      }),
    ])
  })
}

before(async () => {
  if (PROJECT_ID !== 'demo-vendora-e2e' || HOST !== '127.0.0.1') throw new Error('Refusing unsafe Firestore target.')
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
    'customer-active', 'customer-other', 'customer-suspended', 'applicant-rejected',
    'merchant-active', 'merchant-other', 'merchant-suspended', 'merchant-pending',
    'merchant-rejected', 'admin-active', 'admin-suspended',
  ]) clients[uid] = env.authenticatedContext(uid).firestore()
})

after(async () => env?.cleanup())

test('public reads expose only approved public-schema stores', async () => {
  await assertSucceeds(getDoc(doc(clients.anonymous, 'stores/store-approved')))
  const approvedBySlug = await assertSucceeds(getDocs(query(
    collection(clients.anonymous, 'publicStores'),
    where('slug', '==', 'approved-merchant-active'),
    where('status', '==', 'approved'),
  )))
  assert.equal(approvedBySlug.size, 1)
  await assertFails(setDoc(doc(clients['admin-active'], 'publicStores/forged'), store('admin-active', 'approved')))
  await assertFails(getDoc(doc(clients.anonymous, 'stores/store-pending')))
  await assertFails(getDoc(doc(clients.anonymous, 'stores/store-rejected')))
  await assertFails(getDoc(doc(clients.anonymous, 'stores/store-suspended')))
  await assertFails(getDoc(doc(clients.anonymous, 'stores/store-legacy-sensitive')))
})

test('merchant application data is isolated from anonymous, customers, and other merchants', async () => {
  await assertFails(getDoc(doc(clients.anonymous, 'merchantApplications/store-approved')))
  await assertFails(getDoc(doc(clients['customer-active'], 'merchantApplications/store-approved')))
  await assertFails(getDoc(doc(clients['merchant-other'], 'merchantApplications/store-approved')))
  const own = await assertSucceeds(getDoc(doc(clients['merchant-active'], 'merchantApplications/store-approved')))
  assert.equal(own.data().businessName, 'merchant-active Legal Business')
})

test('suspended customers retain private reads but lose protected mutation authority', async () => {
  await assertSucceeds(getDoc(doc(clients['customer-suspended'], 'users/customer-suspended/addresses/home')))
  await assertFails(updateDoc(doc(clients['customer-suspended'], 'users/customer-suspended/addresses/home'), {
    line1: 'Attempted suspended update', updatedAt: serverTimestamp(),
  }))
})

test('active approved merchants can edit their own resources but not another store', async () => {
  await assertSucceeds(updateDoc(doc(clients['merchant-active'], 'stores/store-approved'), {
    description: 'An updated public description that remains safe for storefront readers.',
    updatedAt: serverTimestamp(),
  }))
  await assertSucceeds(updateDoc(doc(clients['merchant-active'], 'products/product-public'), {
    stock: 12, updatedAt: serverTimestamp(),
  }))
  await assertFails(updateDoc(doc(clients['merchant-active'], 'products/product-material-edit'), {
    name: 'Material bypass attempt', updatedAt: serverTimestamp(),
  }))
  await assertSucceeds(updateDoc(doc(clients['merchant-active'], 'products/product-material-edit'), {
    name: 'Updated own product', status: 'pending', publiclyVisible: false,
    rejectionReason: '', updatedAt: serverTimestamp(),
  }))
  await assertFails(updateDoc(doc(clients['merchant-active'], 'stores/store-other'), {
    description: 'Cross-store mutation attempt.', updatedAt: serverTimestamp(),
  }))
  await assertFails(updateDoc(doc(clients['merchant-active'], 'products/product-other'), {
    name: 'Cross-store product mutation', updatedAt: serverTimestamp(),
  }))
})

test('suspended merchants lose direct store and product mutation authority', async () => {
  await assertFails(updateDoc(doc(clients['merchant-suspended'], 'stores/store-suspended-user'), {
    description: 'Suspended merchant mutation attempt.', updatedAt: serverTimestamp(),
  }))
  await assertFails(setDoc(doc(clients['merchant-suspended'], 'products/suspended-create'), {
    ...product('store-suspended-user', 'merchant-suspended', {
      status: 'draft', publiclyVisible: false, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    }),
  }))
})

test('pending and rejected stores do not grant operational product authority', async () => {
  for (const [uid, storeId] of [['merchant-pending', 'store-pending'], ['merchant-rejected', 'store-rejected']]) {
    await assertFails(setDoc(doc(clients[uid], `products/${uid}-forged`), {
      ...product(storeId, uid, {
        status: 'draft', publiclyVisible: false, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
      }),
    }))
  }
})

test('active customers can submit and rejected applicants can atomically resubmit', async () => {
  const createBatch = writeBatch(clients['customer-active'])
  createBatch.set(doc(clients['customer-active'], 'stores/application-new'), {
    ...store('customer-active', 'pending'), createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  })
  createBatch.set(doc(clients['customer-active'], 'merchantApplications/application-new'), {
    ...application('application-new', 'customer-active', 'pending'),
    createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  })
  await assertSucceeds(createBatch.commit())

  const resubmitBatch = writeBatch(clients['applicant-rejected'])
  resubmitBatch.update(doc(clients['applicant-rejected'], 'stores/application-rejected'), {
    name: 'Resubmitted public store', status: 'pending', updatedAt: serverTimestamp(),
  })
  resubmitBatch.update(doc(clients['applicant-rejected'], 'merchantApplications/application-rejected'), {
    businessDocumentUrl: 'data:application/pdf;base64,bmV3', status: 'pending',
    rejectionReason: '', updatedAt: serverTimestamp(),
  })
  await assertSucceeds(resubmitBatch.commit())
})

test('active admins can moderate while suspended admins have no admin authority', async () => {
  await assertSucceeds(updateDoc(doc(clients['admin-active'], 'merchantApplications/store-approved'), {
    rejectionReason: 'Internal moderation result', updatedAt: serverTimestamp(),
  }))
  await assertFails(updateDoc(doc(clients['admin-active'], 'stores/store-approved'), {
    status: 'suspended', updatedAt: serverTimestamp(),
  }))
  await assertFails(updateDoc(doc(clients['admin-suspended'], 'merchantApplications/store-approved'), {
    rejectionReason: 'Suspended admin attempt', updatedAt: serverTimestamp(),
  }))
  await assertFails(updateDoc(doc(clients['admin-suspended'], 'users/customer-active'), {
    role: 'admin', updatedAt: serverTimestamp(),
  }))
})

test('public products require trusted publication state', async () => {
  await assertSucceeds(getDoc(doc(clients.anonymous, 'products/product-public')))
  await assertFails(getDoc(doc(clients.anonymous, 'products/product-suspended-store')))
  const visible = await assertSucceeds(getDocs(query(
    collection(clients.anonymous, 'products'),
    where('status', '==', 'approved'),
    where('publiclyVisible', '==', true),
    where('storeId', '==', 'store-approved'),
  )))
  assert.deepEqual(visible.docs.map((item) => item.id), ['product-public'])
})

test('forged ownership, status, and profile fields cannot recover authority', async () => {
  await assertFails(updateDoc(doc(clients['merchant-active'], 'stores/store-approved'), {
    ownerId: 'merchant-other', status: 'suspended', updatedAt: serverTimestamp(),
  }))
  await assertFails(updateDoc(doc(clients['customer-active'], 'users/customer-active'), {
    role: 'admin', storeId: 'store-approved', suspended: false, updatedAt: serverTimestamp(),
  }))
  await assertFails(updateDoc(doc(clients['merchant-active'], 'products/product-public'), {
    publiclyVisible: false, updatedAt: serverTimestamp(),
  }))
})
