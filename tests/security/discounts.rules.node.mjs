import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { readFile } from 'node:fs/promises'

import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing'
import {
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore'

const PROJECT_ID = 'demo-vendora-e2e'
const FIRESTORE_HOST = '127.0.0.1'
const FIRESTORE_PORT = 8080

let testEnv
let customerDb
let merchantDb
let foreignMerchantDb
let adminDb

function coupon(overrides = {}) {
  return {
    code: 'SECURE25',
    type: 'fixed',
    value: 25,
    usageLimit: 1,
    usedCount: 0,
    perCustomerLimit: 1,
    active: true,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  }
}

function order(overrides = {}) {
  return {
    orderNumber: 'E2E-SECURE-1',
    customerId: 'customer-1',
    customerName: 'Customer One',
    customerEmail: 'customer-1@example.test',
    customerPhone: '03001234567',
    storeId: 'store-1',
    merchantId: 'merchant-1',
    storeName: 'Store One',
    items: [{ productId: 'product-1', name: 'Product One', price: 100, quantity: 1 }],
    subtotal: 100,
    discount: 0,
    shippingFee: 0,
    tax: 0,
    total: 100,
    paymentMethod: 'cod',
    cashReceived: false,
    status: 'pending',
    shippingAddress: {
      fullName: 'Customer One',
      phone: '03001234567',
      line1: '27 Emulator Avenue',
      city: 'Lahore',
      province: 'Punjab',
      postalCode: '54000',
      country: 'Pakistan',
    },
    timeline: [{ status: 'pending', at: 1_700_000_000_000, by: 'customer-1' }],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    ...overrides,
  }
}

async function seed() {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore()
    await Promise.all([
      setDoc(doc(db, 'users/customer-1'), {
        role: 'customer',
        email: 'customer-1@example.test',
        displayName: 'Customer One',
      }),
      setDoc(doc(db, 'users/merchant-1'), {
        role: 'merchant',
        email: 'merchant-1@example.test',
        displayName: 'Merchant One',
      }),
      setDoc(doc(db, 'users/merchant-2'), {
        role: 'merchant',
        email: 'merchant-2@example.test',
        displayName: 'Merchant Two',
      }),
      setDoc(doc(db, 'users/admin-1'), {
        role: 'admin',
        email: 'admin-1@example.test',
        displayName: 'Admin One',
      }),
      setDoc(doc(db, 'stores/store-1'), { ownerId: 'merchant-1', status: 'approved' }),
      setDoc(doc(db, 'stores/store-2'), { ownerId: 'merchant-2', status: 'approved' }),
      setDoc(doc(db, 'coupons/secure-coupon'), coupon({ storeId: 'store-1' })),
      setDoc(doc(db, 'coupons/foreign-coupon'), coupon({
        storeId: 'store-2',
        code: 'FOREIGN25',
        usageLimit: 10,
        perCustomerLimit: 10,
      })),
    ])
  })
}

before(async () => {
  if (PROJECT_ID !== 'demo-vendora-e2e' || FIRESTORE_HOST !== '127.0.0.1') {
    throw new Error('Refusing unsafe Firebase security-test target')
  }
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      host: FIRESTORE_HOST,
      port: FIRESTORE_PORT,
      rules: await readFile(new URL('../../firestore.rules', import.meta.url), 'utf8'),
    },
  })
  await testEnv.clearFirestore()
  await seed()

  customerDb = testEnv.authenticatedContext('customer-1').firestore()
  merchantDb = testEnv.authenticatedContext('merchant-1').firestore()
  foreignMerchantDb = testEnv.authenticatedContext('merchant-2').firestore()
  adminDb = testEnv.authenticatedContext('admin-1').firestore()
})

after(async () => testEnv?.cleanup())

test('customers cannot create coupons or alter coupon authority fields', async () => {
  await assertFails(
    setDoc(doc(customerDb, 'coupons/forged'), {
      ...coupon({ code: 'FORGED25', createdAt: serverTimestamp(), updatedAt: serverTimestamp() }),
    }),
  )

  for (const mutation of [
    { value: 99 },
    { storeId: 'store-2' },
    { active: false },
    { expiresAt: Date.now() + 86_400_000 },
    { usedCount: 1 },
  ]) {
    await assertFails(
      updateDoc(doc(customerDb, 'coupons/secure-coupon'), {
        ...mutation,
        updatedAt: serverTimestamp(),
      }),
    )
  }
})

test('detached usage records and forged discounted orders are denied', async () => {
  await assertFails(
    setDoc(doc(customerDb, 'couponUsages/detached'), {
      couponId: 'secure-coupon',
      couponCode: 'SECURE25',
      customerId: 'customer-1',
      orderIds: ['forged-order'],
      discount: 25,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }),
  )
  await assertFails(
    setDoc(doc(customerDb, 'orders/forged-order'), order({
      discount: 90,
      total: 10,
      couponId: 'secure-coupon',
      couponCode: 'SECURE25',
      couponUsageId: 'detached',
    })),
  )
})

async function redeemSecureCoupon(usageId, orderId) {
  return runTransaction(customerDb, async (transaction) => {
    const couponRef = doc(customerDb, 'coupons/secure-coupon')
    const counterRef = doc(customerDb, 'customerCouponUsages/secure-coupon_customer-1')
    const usageRef = doc(customerDb, `couponUsages/${usageId}`)
    const orderRef = doc(customerDb, `orders/${orderId}`)
    const [couponSnapshot, counterSnapshot] = await Promise.all([
      transaction.get(couponRef),
      transaction.get(counterRef),
    ])
    const nextCouponCount = couponSnapshot.data().usedCount + 1
    const nextCustomerCount = (counterSnapshot.data()?.count ?? 0) + 1

    transaction.update(couponRef, {
      usedCount: nextCouponCount,
      updatedAt: serverTimestamp(),
    })
    transaction.set(counterRef, {
      couponId: 'secure-coupon',
      customerId: 'customer-1',
      count: nextCustomerCount,
      lastUsageId: usageId,
      createdAt: counterSnapshot.exists()
        ? counterSnapshot.data().createdAt
        : serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
    transaction.set(usageRef, {
      couponId: 'secure-coupon',
      couponCode: 'SECURE25',
      customerId: 'customer-1',
      orderIds: [orderId],
      discount: 25,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
    transaction.set(orderRef, order({
      orderNumber: `E2E-${orderId}`,
      discount: 25,
      total: 75,
      couponBasis: 100,
      couponId: 'secure-coupon',
      couponCode: 'SECURE25',
      couponUsageId: usageId,
    }))
  })
}

test('even an internally consistent linked redemption is denied to customers', async () => {
  await assertFails(redeemSecureCoupon('usage-1', 'secure-order-1'))
  assert.equal((await getDoc(doc(customerDb, 'coupons/secure-coupon'))).data().usedCount, 0)
  assert.equal(
    (await getDoc(doc(customerDb, 'customerCouponUsages/secure-coupon_customer-1'))).exists(),
    false,
  )
})

test('merchants can manage only their own store coupons without forging usage', async () => {
  await assertSucceeds(
    setDoc(doc(merchantDb, 'coupons/merchant-new'), {
      ...coupon({
        storeId: 'store-1',
        code: 'MERCHANT10',
        usageLimit: 10,
        perCustomerLimit: 2,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }),
    }),
  )
  await assertSucceeds(
    updateDoc(doc(merchantDb, 'coupons/merchant-new'), {
      value: 10,
      updatedAt: serverTimestamp(),
    }),
  )
  await assertFails(
    updateDoc(doc(merchantDb, 'coupons/merchant-new'), {
      usedCount: 1,
      updatedAt: serverTimestamp(),
    }),
  )
  await assertFails(
    updateDoc(doc(merchantDb, 'coupons/foreign-coupon'), {
      value: 10,
      updatedAt: serverTimestamp(),
    }),
  )
  await assertFails(
    updateDoc(doc(foreignMerchantDb, 'coupons/merchant-new'), {
      storeId: 'store-2',
      updatedAt: serverTimestamp(),
    }),
  )
})

test('admins can create and update platform coupons', async () => {
  await assertSucceeds(
    setDoc(doc(adminDb, 'coupons/platform-new'), {
      ...coupon({
        code: 'PLATFORM10',
        usageLimit: 100,
        perCustomerLimit: 2,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }),
    }),
  )
  await assertSucceeds(
    updateDoc(doc(adminDb, 'coupons/platform-new'), {
      active: false,
      updatedAt: serverTimestamp(),
    }),
  )
})
