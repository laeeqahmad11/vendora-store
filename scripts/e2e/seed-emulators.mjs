/**
 * Destructive reset + deterministic seed for the local Firebase emulators.
 *
 * This script deliberately has no project/host overrides. It can address only
 * the loopback emulators for the demo-vendora-e2e project, and it never loads
 * application-default credentials or the production Firebase configuration.
 */

const PROJECT_ID = 'demo-vendora-e2e'
const STORAGE_BUCKET = `${PROJECT_ID}.appspot.com`
const AUTH_HOST = '127.0.0.1:9099'
const FIRESTORE_HOST = '127.0.0.1:8080'
const STORAGE_HOST = '127.0.0.1:9199'
const TEST_PASSWORD = 'VendoraE2E!123'
const CATALOG = {
  category: {
    id: 'e2e-electronics',
    name: 'E2E Electronics',
    slug: 'e2e-electronics',
  },
  subcategory: {
    id: 'e2e-chargers',
    name: 'E2E Chargers',
    slug: 'e2e-chargers',
  },
  brand: {
    id: 'e2e-voltedge',
    name: 'E2E VoltEdge',
    slug: 'e2e-voltedge',
  },
}

const USERS = [
  {
    uid: 'e2e-customer',
    email: 'customer@e2e.vendora.test',
    displayName: 'E2E Customer',
    role: 'customer',
  },
  {
    uid: 'e2e-merchant',
    email: 'merchant@e2e.vendora.test',
    displayName: 'E2E Merchant',
    role: 'merchant',
    storeId: 'e2e-approved-store',
  },
  {
    uid: 'e2e-admin',
    email: 'admin@e2e.vendora.test',
    displayName: 'E2E Admin',
    role: 'admin',
  },
]

function assertSafeTarget() {
  if (!PROJECT_ID.startsWith('demo-')) {
    throw new Error(`Refusing non-demo Firebase project: ${PROJECT_ID}`)
  }

  for (const host of [AUTH_HOST, FIRESTORE_HOST, STORAGE_HOST]) {
    if (!host.startsWith('127.0.0.1:')) {
      throw new Error(`Refusing non-loopback emulator host: ${host}`)
    }
  }
}

async function clearEmulator(name, url, method = 'DELETE') {
  let response
  try {
    response = await fetch(url, { method })
  } catch (error) {
    throw new Error(`${name} emulator is not reachable at ${url}`, { cause: error })
  }

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`${name} emulator reset failed (${response.status}): ${body}`)
  }
}

async function resetEmulators({ preserveAuth = false } = {}) {
  const resets = [
    clearEmulator(
      'Firestore',
      `http://${FIRESTORE_HOST}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`,
    ),
    clearEmulator(
      'Storage',
      `http://${STORAGE_HOST}/internal/reset`,
      'POST',
    ),
  ]

  if (!preserveAuth) {
    resets.push(
      clearEmulator(
        'Auth',
        `http://${AUTH_HOST}/emulator/v1/projects/${PROJECT_ID}/accounts`,
      ),
    )
  }

  await Promise.all(resets)
}

async function seed({ preserveAuth = false } = {}) {
  process.env.GCLOUD_PROJECT = PROJECT_ID
  process.env.FIREBASE_CONFIG = JSON.stringify({
    projectId: PROJECT_ID,
    storageBucket: STORAGE_BUCKET,
  })
  process.env.FIREBASE_AUTH_EMULATOR_HOST = AUTH_HOST
  process.env.FIRESTORE_EMULATOR_HOST = FIRESTORE_HOST
  process.env.FIREBASE_STORAGE_EMULATOR_HOST = STORAGE_HOST

  const [{ initializeApp }, { getAuth }, { FieldValue, getFirestore }] = await Promise.all([
    import('firebase-admin/app'),
    import('firebase-admin/auth'),
    import('firebase-admin/firestore'),
  ])

  const app = initializeApp({ projectId: PROJECT_ID, storageBucket: STORAGE_BUCKET })
  const auth = getAuth(app)
  const db = getFirestore(app)
  const now = FieldValue.serverTimestamp()

  for (const user of USERS) {
    if (!preserveAuth) {
      await auth.createUser({
        uid: user.uid,
        email: user.email,
        password: TEST_PASSWORD,
        displayName: user.displayName,
        emailVerified: true,
        disabled: false,
      })
    }

    await db.doc(`users/${user.uid}`).set({
      email: user.email,
      displayName: user.displayName,
      photoURL: '',
      phone: '03001234567',
      role: user.role,
      ...(user.storeId ? { storeId: user.storeId } : {}),
      emailVerified: true,
      suspended: false,
      createdAt: now,
      updatedAt: now,
    })
  }

  await db.doc('stores/e2e-approved-store').set({
    ownerId: 'e2e-merchant',
    name: 'E2E Approved Store',
    slug: 'e2e-approved-store',
    description: 'Deterministic emulator-only merchant store for authenticated E2E tests.',
    email: 'store@e2e.vendora.test',
    phone: '03001234567',
    address: 'E2E Test Street, Localhost',
    businessName: 'Vendora E2E Store',
    status: 'approved',
    verified: true,
    rating: 0,
    ratingCount: 0,
    productCount: 0,
    totalSales: 0,
    createdAt: now,
    updatedAt: now,
  })

  await Promise.all([
    db.doc(`categories/${CATALOG.category.id}`).set({
      name: CATALOG.category.name,
      slug: CATALOG.category.slug,
      parentId: null,
      description: 'Deterministic emulator-only category for authenticated E2E tests.',
      featured: false,
      sortOrder: 1,
      productCount: 0,
      createdAt: now,
    }),
    db.doc(`categories/${CATALOG.subcategory.id}`).set({
      name: CATALOG.subcategory.name,
      slug: CATALOG.subcategory.slug,
      parentId: CATALOG.category.id,
      description: 'Deterministic emulator-only subcategory for authenticated E2E tests.',
      featured: false,
      sortOrder: 1,
      productCount: 0,
      createdAt: now,
    }),
    db.doc(`brands/${CATALOG.brand.id}`).set({
      name: CATALOG.brand.name,
      slug: CATALOG.brand.slug,
      featured: false,
      createdAt: now,
    }),
  ])
}

async function main() {
  assertSafeTarget()
  const preserveAuth = process.argv.includes('--preserve-auth')
  await resetEmulators({ preserveAuth })

  if (process.argv.includes('--reset-only')) {
    console.log(`Reset Firebase emulators for ${PROJECT_ID}.`)
    return
  }

  await seed({ preserveAuth })
  console.log(`Seeded Firebase emulators for ${PROJECT_ID}:`)
  for (const user of USERS) {
    console.log(`  ${user.role}: ${user.email} / ${TEST_PASSWORD}`)
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
