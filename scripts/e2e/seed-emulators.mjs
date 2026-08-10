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
const INVENTORY_PRODUCT = {
  id: 'e2e-inventory-product',
  name: 'E2E Inventory Control Product',
  slug: 'e2e-inventory-control-product',
  sku: 'E2E-INV-027',
  stock: 27,
  soldCount: 0,
  lowStockThreshold: 5,
}
const CHECKOUT_STOCK_PRODUCTS = [
  {
    id: 'e2e-checkout-out-of-stock',
    name: 'E2E Checkout Out of Stock',
    slug: 'e2e-checkout-out-of-stock',
    sku: 'E2E-CHK-OUT-000',
    price: 1100,
    stock: 0,
    maxOrderQty: 5,
  },
  {
    id: 'e2e-checkout-limited-stock',
    name: 'E2E Checkout Limited Stock',
    slug: 'e2e-checkout-limited-stock',
    sku: 'E2E-CHK-LIM-002',
    price: 1200,
    stock: 2,
    maxOrderQty: 10,
  },
  {
    id: 'e2e-checkout-last-unit',
    name: 'E2E Checkout Last Unit',
    slug: 'e2e-checkout-last-unit',
    sku: 'E2E-CHK-LAST-001',
    price: 1300,
    stock: 1,
    maxOrderQty: 10,
  },
  {
    id: 'e2e-checkout-stale-cart',
    name: 'E2E Checkout Stale Cart',
    slug: 'e2e-checkout-stale-cart',
    sku: 'E2E-CHK-STALE-001',
    price: 1400,
    stock: 1,
    maxOrderQty: 10,
  },
]
const REVIEWS_FIXTURES = {
  product: {
    id: 'e2e-reviews-product',
    name: 'E2E Reviews Product',
    slug: 'e2e-reviews-product',
    sku: 'E2E-REV-001',
  },
  foreignStore: {
    id: 'e2e-foreign-store',
    name: 'E2E Foreign Store',
    slug: 'e2e-foreign-store',
  },
  foreignProduct: {
    id: 'e2e-foreign-reviews-product',
    name: 'E2E Foreign Reviews Product',
    slug: 'e2e-foreign-reviews-product',
    sku: 'E2E-REV-FOREIGN-001',
  },
  foreignReview: {
    id: 'e2e-foreign-review',
    comment: 'Foreign-store review must stay outside the approved merchant UI.',
  },
}
const DISCOUNT_PRODUCTS = [
  {
    id: 'e2e-discount-main',
    storeId: 'e2e-approved-store',
    merchantId: 'e2e-merchant',
    storeName: 'E2E Approved Store',
    name: 'E2E Discount Main Product',
    slug: 'e2e-discount-main-product',
    sku: 'E2E-DIS-MAIN',
    price: 200,
  },
  {
    id: 'e2e-discount-small',
    storeId: 'e2e-approved-store',
    merchantId: 'e2e-merchant',
    storeName: 'E2E Approved Store',
    name: 'E2E Discount Small Product',
    slug: 'e2e-discount-small-product',
    sku: 'E2E-DIS-SMALL',
    price: 40,
  },
  {
    id: 'e2e-discount-foreign',
    storeId: 'e2e-discount-foreign-store',
    merchantId: 'e2e-discount-foreign-merchant',
    storeName: 'E2E Discount Foreign Store',
    name: 'E2E Discount Foreign Product',
    slug: 'e2e-discount-foreign-product',
    sku: 'E2E-DIS-FOREIGN',
    price: 80,
  },
]

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
  {
    uid: 'e2e-discount-foreign-merchant',
    email: 'discount-foreign-merchant@e2e.vendora.test',
    displayName: 'E2E Discount Foreign Merchant',
    role: 'merchant',
    storeId: 'e2e-discount-foreign-store',
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
    clearEmulator('Storage', `http://${STORAGE_HOST}/internal/reset`, 'POST'),
  ]

  if (!preserveAuth) {
    resets.push(clearEmulator('Auth', `http://${AUTH_HOST}/emulator/v1/projects/${PROJECT_ID}/accounts`))
  }

  await Promise.all(resets)
}

async function seed({
  preserveAuth = false,
  inventoryProduct = false,
  checkoutStockProducts = false,
  reviewsFixtures = false,
  discountFixtures = false,
} = {}) {
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

  if (inventoryProduct) {
    await db.doc(`products/${INVENTORY_PRODUCT.id}`).set({
      storeId: 'e2e-approved-store',
      merchantId: 'e2e-merchant',
      name: INVENTORY_PRODUCT.name,
      slug: INVENTORY_PRODUCT.slug,
      description: 'Deterministic emulator-only product for merchant inventory E2E coverage.',
      images: [],
      price: 2700,
      currency: 'USD',
      sku: INVENTORY_PRODUCT.sku,
      stock: INVENTORY_PRODUCT.stock,
      lowStockThreshold: INVENTORY_PRODUCT.lowStockThreshold,
      minOrderQty: 1,
      maxOrderQty: 27,
      categoryId: CATALOG.category.id,
      subcategoryId: CATALOG.subcategory.id,
      brandId: CATALOG.brand.id,
      tags: ['e2e', 'inventory'],
      status: 'approved',
      rejectionReason: '',
      featured: false,
      trending: false,
      recommended: false,
      flashSale: null,
      rating: 0,
      ratingCount: 0,
      ratingSum: 0,
      soldCount: INVENTORY_PRODUCT.soldCount,
      viewCount: 0,
      createdAt: now,
      updatedAt: now,
      publishedAt: now,
    })
  }

  if (checkoutStockProducts) {
    for (const product of CHECKOUT_STOCK_PRODUCTS) {
      await db.doc(`products/${product.id}`).set({
        storeId: 'e2e-approved-store',
        merchantId: 'e2e-merchant',
        name: product.name,
        slug: product.slug,
        description: 'Deterministic emulator-only product for checkout and stock edge-case E2E coverage.',
        images: [`http://${STORAGE_HOST}/v0/b/${STORAGE_BUCKET}/o/e2e%2Fcheckout-stock.png?alt=media`],
        price: product.price,
        currency: 'USD',
        sku: product.sku,
        stock: product.stock,
        lowStockThreshold: 2,
        minOrderQty: 1,
        maxOrderQty: product.maxOrderQty,
        categoryId: CATALOG.category.id,
        subcategoryId: CATALOG.subcategory.id,
        brandId: CATALOG.brand.id,
        tags: ['e2e', 'checkout', 'stock-edge'],
        status: 'approved',
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
      })
    }
  }

  if (reviewsFixtures) {
    await Promise.all([
      db.doc(`products/${REVIEWS_FIXTURES.product.id}`).set({
        storeId: 'e2e-approved-store',
        merchantId: 'e2e-merchant',
        name: REVIEWS_FIXTURES.product.name,
        slug: REVIEWS_FIXTURES.product.slug,
        description: 'Deterministic emulator-only product for reviews and ratings E2E coverage.',
        images: [],
        price: 1500,
        currency: 'USD',
        sku: REVIEWS_FIXTURES.product.sku,
        stock: 10,
        lowStockThreshold: 2,
        minOrderQty: 1,
        maxOrderQty: 10,
        categoryId: CATALOG.category.id,
        subcategoryId: CATALOG.subcategory.id,
        brandId: CATALOG.brand.id,
        tags: ['e2e', 'reviews'],
        status: 'approved',
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
      }),
      db.doc(`stores/${REVIEWS_FIXTURES.foreignStore.id}`).set({
        ownerId: 'e2e-foreign-merchant',
        name: REVIEWS_FIXTURES.foreignStore.name,
        slug: REVIEWS_FIXTURES.foreignStore.slug,
        description: 'Deterministic second store for review isolation coverage.',
        email: 'foreign-store@e2e.vendora.test',
        phone: '03007654321',
        address: 'E2E Foreign Test Street, Localhost',
        businessName: 'Vendora Foreign E2E Store',
        status: 'approved',
        verified: true,
        rating: 0,
        ratingCount: 0,
        productCount: 1,
        totalSales: 0,
        createdAt: now,
        updatedAt: now,
      }),
      db.doc(`products/${REVIEWS_FIXTURES.foreignProduct.id}`).set({
        storeId: REVIEWS_FIXTURES.foreignStore.id,
        merchantId: 'e2e-foreign-merchant',
        name: REVIEWS_FIXTURES.foreignProduct.name,
        slug: REVIEWS_FIXTURES.foreignProduct.slug,
        description: 'Deterministic foreign-store product for review isolation coverage.',
        images: [],
        price: 1600,
        currency: 'USD',
        sku: REVIEWS_FIXTURES.foreignProduct.sku,
        stock: 10,
        lowStockThreshold: 2,
        minOrderQty: 1,
        maxOrderQty: 10,
        categoryId: CATALOG.category.id,
        subcategoryId: CATALOG.subcategory.id,
        brandId: CATALOG.brand.id,
        tags: ['e2e', 'reviews', 'foreign-store'],
        status: 'approved',
        rejectionReason: '',
        featured: false,
        trending: false,
        recommended: false,
        flashSale: null,
        rating: 3,
        ratingCount: 1,
        ratingSum: 3,
        soldCount: 0,
        viewCount: 0,
        createdAt: now,
        updatedAt: now,
        publishedAt: now,
      }),
    ])

    await db.doc(`reviews/${REVIEWS_FIXTURES.foreignReview.id}`).set({
      productId: REVIEWS_FIXTURES.foreignProduct.id,
      storeId: REVIEWS_FIXTURES.foreignStore.id,
      customerId: 'e2e-foreign-customer',
      customerName: 'E2E Foreign Customer',
      rating: 3,
      title: 'Foreign review fixture',
      comment: REVIEWS_FIXTURES.foreignReview.comment,
      status: 'approved',
      helpfulCount: 0,
      aggregateVersion: 1,
      createdAt: now,
      updatedAt: now,
    })
  }

  if (discountFixtures) {
    const clock = Date.now()
    await db.doc('stores/e2e-approved-store').update({
      shippingEnabled: false,
      shippingFee: 0,
      updatedAt: now,
    })
    await db.doc('stores/e2e-discount-foreign-store').set({
      ownerId: 'e2e-discount-foreign-merchant',
      name: 'E2E Discount Foreign Store',
      slug: 'e2e-discount-foreign-store',
      description: 'Second deterministic store for coupon isolation tests.',
      email: 'discount-foreign-store@e2e.vendora.test',
      phone: '03007654321',
      status: 'approved',
      verified: true,
      rating: 0,
      ratingCount: 0,
      productCount: 1,
      totalSales: 0,
      shippingEnabled: false,
      shippingFee: 0,
      createdAt: now,
      updatedAt: now,
    })

    for (const product of DISCOUNT_PRODUCTS) {
      await db.doc(`products/${product.id}`).set({
        storeId: product.storeId,
        merchantId: product.merchantId,
        name: product.name,
        slug: product.slug,
        description: 'Deterministic emulator-only product for coupon coverage.',
        images: [],
        price: product.price,
        currency: 'USD',
        sku: product.sku,
        stock: 20,
        lowStockThreshold: 2,
        minOrderQty: 1,
        maxOrderQty: 10,
        categoryId: CATALOG.category.id,
        subcategoryId: CATALOG.subcategory.id,
        brandId: CATALOG.brand.id,
        tags: ['e2e', 'discounts'],
        status: 'approved',
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
      })
    }

    const coupons = [
      ['percent-cap', { code: 'PERCENT20', type: 'percentage', value: 20, minOrderAmount: 100, maxDiscount: 30 }],
      ['fixed-large', { code: 'FIXED150', type: 'fixed', value: 150 }],
      ['store-only', { storeId: 'e2e-approved-store', code: 'STORE25', type: 'fixed', value: 25 }],
      ['inactive', { code: 'INACTIVE10', type: 'percentage', value: 10, active: false }],
      ['expired', { code: 'EXPIRED10', type: 'percentage', value: 10, expiresAt: clock - 60_000 }],
      ['future', { code: 'FUTURE10', type: 'percentage', value: 10, startsAt: clock + 3_600_000 }],
      ['minimum', { code: 'MINIMUM10', type: 'percentage', value: 10, minOrderAmount: 100 }],
      ['limit-one', { code: 'LIMITONE', type: 'fixed', value: 10, usageLimit: 1 }],
      ['customer-one', { code: 'CUSTOMERONE', type: 'fixed', value: 10, perCustomerLimit: 1 }],
      ['stale', { code: 'STALE20', type: 'percentage', value: 20 }],
    ]
    for (const [id, fixture] of coupons) {
      await db.doc(`coupons/e2e-${id}`).set({
        ...fixture,
        active: fixture.active ?? true,
        usedCount: 0,
        createdAt: now,
        updatedAt: now,
      })
    }
  }
}

async function main() {
  assertSafeTarget()
  const preserveAuth = process.argv.includes('--preserve-auth')
  const inventoryProduct = process.argv.includes('--inventory-product')
  const checkoutStockProducts = process.argv.includes('--checkout-stock-products')
  const reviewsFixtures = process.argv.includes('--reviews-fixtures')
  const discountFixtures = process.argv.includes('--discount-fixtures')
  await resetEmulators({ preserveAuth })

  if (process.argv.includes('--reset-only')) {
    console.log(`Reset Firebase emulators for ${PROJECT_ID}.`)
    return
  }

  await seed({ preserveAuth, inventoryProduct, checkoutStockProducts, reviewsFixtures, discountFixtures })
  console.log(`Seeded Firebase emulators for ${PROJECT_ID}:`)
  for (const user of USERS) {
    console.log(`  ${user.role}: ${user.email} / ${TEST_PASSWORD}`)
  }
  if (inventoryProduct) {
    console.log(
      `  inventory product: ${INVENTORY_PRODUCT.name} (${INVENTORY_PRODUCT.sku}), ` +
        `stock ${INVENTORY_PRODUCT.stock}, sold ${INVENTORY_PRODUCT.soldCount}, ` +
        `low-stock threshold ${INVENTORY_PRODUCT.lowStockThreshold}`,
    )
  }
  if (checkoutStockProducts) {
    for (const product of CHECKOUT_STOCK_PRODUCTS) {
      console.log(
        `  checkout product: ${product.name} (${product.sku}), ` +
          `stock ${product.stock}, sold 0, max order ${product.maxOrderQty}`,
      )
    }
  }
  if (reviewsFixtures) {
    console.log(
      `  reviews product: ${REVIEWS_FIXTURES.product.name} (${REVIEWS_FIXTURES.product.sku}), ` +
        'rating 0, reviews 0',
    )
    console.log(
      `  foreign review: ${REVIEWS_FIXTURES.foreignReview.id} for ` +
        `${REVIEWS_FIXTURES.foreignStore.name}`,
    )
  }
  if (discountFixtures) {
    console.log(`  discount fixtures: ${DISCOUNT_PRODUCTS.length} products, 10 coupons`)
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
