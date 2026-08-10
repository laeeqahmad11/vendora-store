import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { readFile } from 'node:fs/promises'

import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing'
import {
  Timestamp,
  deleteDoc,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore'

const PROJECT_ID = 'demo-vendora-e2e'
const FIRESTORE_HOST = '127.0.0.1'
const FIRESTORE_PORT = 8080
const FIXED_TIME = Timestamp.fromMillis(1_700_000_000_000)

let testEnv
let anonymousDb
let customerDb
let newCustomerDb
let merchantDb
let adminDb

function profile(uid, email, role = 'customer', overrides = {}) {
  return {
    email,
    displayName: uid === 'customer-1' ? 'Customer One' : 'Customer Two',
    photoURL: '',
    phone: '03001234567',
    role,
    emailVerified: true,
    suspended: false,
    createdAt: FIXED_TIME,
    updatedAt: FIXED_TIME,
    ...overrides,
  }
}

function address(overrides = {}) {
  return {
    label: 'Home',
    fullName: 'Customer One',
    phone: '03001234567',
    line1: '27 Emulator Avenue',
    city: 'Lahore',
    province: 'Punjab',
    postalCode: '54000',
    country: 'Pakistan',
    isDefault: true,
    createdAt: FIXED_TIME,
    updatedAt: FIXED_TIME,
    ...overrides,
  }
}

async function seedFirestore() {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore()
    await Promise.all([
      setDoc(
        doc(db, 'users/customer-1'),
        profile('customer-1', 'customer-1@example.test'),
      ),
      setDoc(
        doc(db, 'users/customer-2'),
        profile('customer-2', 'customer-2@example.test'),
      ),
      setDoc(
        doc(db, 'users/merchant-1'),
        profile('merchant-1', 'merchant-1@example.test', 'merchant', {
          displayName: 'Merchant One',
          storeId: 'store-1',
        }),
      ),
      setDoc(
        doc(db, 'users/admin-1'),
        profile('admin-1', 'admin-1@example.test', 'admin', {
          displayName: 'Admin One',
        }),
      ),
      setDoc(doc(db, 'stores/store-1'), {
        ownerId: 'merchant-1',
      }),
      setDoc(
        doc(db, 'users/customer-1/addresses/home'),
        address(),
      ),
      setDoc(
        doc(db, 'users/customer-2/addresses/home'),
        address({ fullName: 'Customer Two' }),
      ),
      setDoc(doc(db, 'orders/customer-merchant-order'), {
        customerId: 'customer-1',
        merchantId: 'merchant-1',
        storeId: 'store-1',
      }),
    ])
  })
}

before(async () => {
  if (PROJECT_ID !== 'demo-vendora-e2e') {
    throw new Error(`Refusing non-demo Firebase project: ${PROJECT_ID}`)
  }
  if (FIRESTORE_HOST !== '127.0.0.1') {
    throw new Error(`Refusing non-loopback Firestore host: ${FIRESTORE_HOST}`)
  }

  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      host: FIRESTORE_HOST,
      port: FIRESTORE_PORT,
      rules: await readFile(
        new URL('../../firestore.rules', import.meta.url),
        'utf8',
      ),
    },
  })
  await testEnv.clearFirestore()
  await seedFirestore()

  anonymousDb = testEnv.unauthenticatedContext().firestore()
  customerDb = testEnv
    .authenticatedContext('customer-1', {
      email: 'customer-1@example.test',
      email_verified: true,
    })
    .firestore()
  newCustomerDb = testEnv
    .authenticatedContext('customer-3', {
      email: 'customer-3@example.test',
      email_verified: false,
    })
    .firestore()
  merchantDb = testEnv
    .authenticatedContext('merchant-1', {
      email: 'merchant-1@example.test',
      email_verified: true,
    })
    .firestore()
  adminDb = testEnv
    .authenticatedContext('admin-1', {
      email: 'admin-1@example.test',
      email_verified: true,
    })
    .firestore()
})

after(async () => {
  await testEnv?.cleanup()
})

test('anonymous users cannot read private profiles or addresses', async () => {
  await assertFails(getDoc(doc(anonymousDb, 'users/customer-1')))
  await assertFails(
    getDoc(doc(anonymousDb, 'users/customer-1/addresses/home')),
  )
})

test('customers can read and update supported fields on their own profile', async () => {
  const snapshot = await assertSucceeds(
    getDoc(doc(customerDb, 'users/customer-1')),
  )
  assert.equal(snapshot.data().email, 'customer-1@example.test')

  await assertSucceeds(
    updateDoc(doc(customerDb, 'users/customer-1'), {
      displayName: 'Customer One Updated',
      phone: '03111234567',
      updatedAt: serverTimestamp(),
    }),
  )
})

test('customers cannot read or update another customer profile', async () => {
  await assertFails(getDoc(doc(customerDb, 'users/customer-2')))
  await assertFails(
    updateDoc(doc(customerDb, 'users/customer-2'), {
      displayName: 'Cross-customer overwrite',
      updatedAt: serverTimestamp(),
    }),
  )
})

test('customers cannot forge privileged or immutable profile fields', async () => {
  const mutations = [
    { role: 'admin' },
    { suspended: true },
    { storeId: 'forged-store' },
    { email: 'forged@example.test' },
    { emailVerified: false },
    { createdAt: serverTimestamp() },
    { adminNotes: 'forged metadata' },
  ]

  for (const mutation of mutations) {
    await assertFails(
      updateDoc(doc(customerDb, 'users/customer-1'), {
        ...mutation,
        updatedAt: serverTimestamp(),
      }),
    )
  }
})

test('new customer profiles accept only the legitimate registration shape', async () => {
  const validProfile = {
    email: 'customer-3@example.test',
    displayName: 'Customer Three',
    photoURL: '',
    role: 'customer',
    emailVerified: false,
    suspended: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }

  await assertFails(
    setDoc(doc(newCustomerDb, 'users/customer-3'), {
      ...validProfile,
      privilegedMetadata: true,
    }),
  )
  await assertSucceeds(
    setDoc(doc(newCustomerDb, 'users/customer-3'), validProfile),
  )
})

test('customers retain CRUD access to valid addresses in their own subcollection', async () => {
  await assertSucceeds(
    getDoc(doc(customerDb, 'users/customer-1/addresses/home')),
  )
  await assertSucceeds(
    setDoc(doc(customerDb, 'users/customer-1/addresses/office'), {
      ...address({ label: 'Office', isDefault: false }),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }),
  )
  await assertSucceeds(
    updateDoc(doc(customerDb, 'users/customer-1/addresses/office'), {
      city: 'Islamabad',
      updatedAt: serverTimestamp(),
    }),
  )
  await assertSucceeds(
    deleteDoc(doc(customerDb, 'users/customer-1/addresses/office')),
  )
})

test('customers cannot read or mutate another customer address', async () => {
  const foreignAddress = doc(
    customerDb,
    'users/customer-2/addresses/home',
  )
  await assertFails(getDoc(foreignAddress))
  await assertFails(
    setDoc(
      doc(customerDb, 'users/customer-2/addresses/forged'),
      address({ createdAt: serverTimestamp(), updatedAt: serverTimestamp() }),
    ),
  )
  await assertFails(
    updateDoc(foreignAddress, {
      city: 'Cross-customer overwrite',
      updatedAt: serverTimestamp(),
    }),
  )
  await assertFails(deleteDoc(foreignAddress))
})

test('address writes reject malformed shapes and privileged metadata', async () => {
  await assertFails(
    setDoc(doc(customerDb, 'users/customer-1/addresses/forged'), {
      ...address({
        role: 'admin',
        ownerId: 'customer-2',
        isDefault: 'yes',
      }),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }),
  )
  await assertFails(
    updateDoc(doc(customerDb, 'users/customer-1/addresses/home'), {
      customerId: 'customer-2',
      updatedAt: serverTimestamp(),
    }),
  )
})

test('an order does not grant its merchant customer-profile or address access', async () => {
  await assertFails(getDoc(doc(merchantDb, 'users/customer-1')))
  await assertFails(
    getDoc(doc(merchantDb, 'users/customer-1/addresses/home')),
  )
  await assertFails(
    updateDoc(doc(merchantDb, 'users/customer-1'), {
      phone: '03009999999',
      updatedAt: serverTimestamp(),
    }),
  )
})

test('admins can manage platform profile fields but not private addresses', async () => {
  await assertSucceeds(getDoc(doc(adminDb, 'users/customer-1')))
  await assertSucceeds(
    updateDoc(doc(adminDb, 'users/customer-2'), {
      suspended: true,
      updatedAt: serverTimestamp(),
    }),
  )
  await assertFails(
    getDoc(doc(adminDb, 'users/customer-1/addresses/home')),
  )
})
