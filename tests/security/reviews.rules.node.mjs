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
const FIRESTORE_HOST = '127.0.0.1'
const FIRESTORE_PORT = 8080
const FIXED_TIME = Timestamp.fromMillis(1_700_000_000_000)

let testEnv
let anonymousDb
let customerDb
let otherCustomerDb
let merchantDb
let foreignMerchantDb
let adminDb

function review(overrides = {}) {
  return {
    productId: 'product-owned',
    storeId: 'store-owned',
    customerId: 'customer-1',
    customerName: 'Customer One',
    rating: 5,
    title: 'Secure review',
    comment: 'A legitimate customer review.',
    images: ['http://127.0.0.1:9199/review.png'],
    status: 'approved',
    helpfulCount: 0,
    aggregateVersion: 1,
    createdAt: FIXED_TIME,
    updatedAt: FIXED_TIME,
    ...overrides,
  }
}

function createPayload(overrides = {}) {
  return {
    productId: 'product-owned',
    storeId: 'store-owned',
    customerId: 'customer-1',
    customerName: 'Customer One',
    rating: 5,
    title: 'Secure review',
    comment: 'A legitimate customer review.',
    images: ['http://127.0.0.1:9199/review.png'],
    status: 'approved',
    helpfulCount: 0,
    aggregateVersion: 1,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    ...overrides,
  }
}

async function seedFirestore() {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore()
    const writes = [
      setDoc(doc(db, 'users/customer-1'), { role: 'customer' }),
      setDoc(doc(db, 'users/customer-2'), { role: 'customer' }),
      setDoc(doc(db, 'users/merchant-1'), { role: 'merchant' }),
      setDoc(doc(db, 'users/merchant-2'), { role: 'merchant' }),
      setDoc(doc(db, 'users/admin-1'), { role: 'admin' }),
      setDoc(doc(db, 'stores/store-owned'), { ownerId: 'merchant-1' }),
      setDoc(doc(db, 'stores/store-foreign'), { ownerId: 'merchant-2' }),
      setDoc(doc(db, 'products/product-owned'), {
        storeId: 'store-owned',
        status: 'approved',
        rating: 5,
        ratingCount: 5,
        ratingSum: 25,
      }),
      setDoc(doc(db, 'products/product-foreign'), {
        storeId: 'store-foreign',
        status: 'approved',
        rating: 5,
        ratingCount: 1,
        ratingSum: 5,
      }),
      setDoc(doc(db, 'products/product-draft'), {
        storeId: 'store-owned',
        status: 'draft',
        rating: 0,
        ratingCount: 0,
        ratingSum: 0,
      }),
      setDoc(doc(db, 'products/product-helpful'), {
        storeId: 'store-owned',
        status: 'approved',
        rating: 5,
        ratingCount: 2,
        ratingSum: 10,
      }),
      setDoc(doc(db, 'products/product-integrity'), {
        storeId: 'store-owned',
        status: 'approved',
        rating: 0,
        ratingCount: 0,
        ratingSum: 0,
      }),
      setDoc(doc(db, 'products/product-create'), {
        storeId: 'store-owned',
        status: 'approved',
        rating: 0,
        ratingCount: 0,
        ratingSum: 0,
      }),
      setDoc(doc(db, 'reviews/approved'), review()),
      setDoc(doc(db, 'reviews/hidden'), review({ status: 'hidden' })),
      setDoc(doc(db, 'reviews/rejected'), review({ status: 'rejected' })),
      setDoc(doc(db, 'reviews/pending'), review({ status: 'pending' })),
      setDoc(doc(db, 'reviews/merchant-reply'), review()),
      setDoc(doc(db, 'reviews/merchant-status'), review()),
      setDoc(doc(db, 'reviews/interactions'), review()),
      setDoc(doc(db, 'reviews/lifecycle'), review()),
      setDoc(
        doc(db, 'reviews/foreign'),
        review({
          productId: 'product-foreign',
          storeId: 'store-foreign',
        }),
      ),
      setDoc(doc(db, 'reviews/admin-delete'), review({ status: 'hidden' })),
      setDoc(doc(db, 'reviews/helpful-a'), review({ productId: 'product-helpful' })),
      setDoc(doc(db, 'reviews/helpful-b'), review({ productId: 'product-helpful' })),
    ]

    await Promise.all(writes)
  })
}

function aggregateUpdate({ ratingSum, ratingCount }, reviewId, ratingReviewVersion = 1) {
  return {
    rating: ratingCount > 0 ? ratingSum / ratingCount : 0,
    ratingCount,
    ratingSum,
    ratingReviewId: reviewId,
    ratingReviewVersion,
    updatedAt: serverTimestamp(),
  }
}

async function createApprovedReview(db, id, payload, aggregate) {
  const batch = writeBatch(db)
  batch.set(doc(db, 'reviews', id), payload)
  batch.update(
    doc(db, 'products', payload.productId),
    aggregateUpdate(
      {
        ratingSum: aggregate.ratingSum + payload.rating,
        ratingCount: aggregate.ratingCount + 1,
      },
      id,
    ),
  )
  await batch.commit()
}

async function setReviewStatus(
  db,
  id,
  status,
  productId,
  aggregate,
  rating,
  aggregateVersion,
) {
  const direction = status === 'approved' ? 1 : -1
  const batch = writeBatch(db)
  batch.update(doc(db, 'reviews', id), {
    status,
    aggregateVersion,
    updatedAt: serverTimestamp(),
  })
  batch.update(
    doc(db, 'products', productId),
    aggregateUpdate(
      {
        ratingSum: aggregate.ratingSum + direction * rating,
        ratingCount: aggregate.ratingCount + direction,
      },
      id,
      aggregateVersion,
    ),
  )
  await batch.commit()
}

async function helpfulVote(db, reviewId, uid, nextCount, overrides = {}) {
  const batch = writeBatch(db)
  batch.set(doc(db, `reviews/${reviewId}/helpfulVotes/${uid}`), {
    reviewId,
    userId: uid,
    createdAt: serverTimestamp(),
    ...overrides,
  })
  batch.update(doc(db, 'reviews', reviewId), {
    helpfulCount: nextCount,
    updatedAt: serverTimestamp(),
  })
  await batch.commit()
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
      rules: await readFile(new URL('../../firestore.rules', import.meta.url), 'utf8'),
    },
  })
  await testEnv.clearFirestore()
  await seedFirestore()

  anonymousDb = testEnv.unauthenticatedContext().firestore()
  customerDb = testEnv.authenticatedContext('customer-1').firestore()
  otherCustomerDb = testEnv.authenticatedContext('customer-2').firestore()
  merchantDb = testEnv.authenticatedContext('merchant-1').firestore()
  foreignMerchantDb = testEnv.authenticatedContext('merchant-2').firestore()
  adminDb = testEnv.authenticatedContext('admin-1').firestore()
})

after(async () => {
  await testEnv?.cleanup()
})

test('anonymous users can read approved reviews through the public query', async () => {
  const approvedQuery = query(collection(anonymousDb, 'reviews'), where('status', '==', 'approved'))
  const snapshot = await assertSucceeds(getDocs(approvedQuery))
  assert.ok(snapshot.docs.some((item) => item.id === 'approved'))
})

test('anonymous users cannot read hidden, rejected, or pending reviews', async () => {
  for (const id of ['hidden', 'rejected', 'pending']) {
    await assertFails(getDoc(doc(anonymousDb, 'reviews', id)))
  }

  await assertFails(getDocs(collection(anonymousDb, 'reviews')))
})

test('authors and owning merchants retain legitimate non-public visibility', async () => {
  await assertSucceeds(getDoc(doc(customerDb, 'reviews/hidden')))
  const storeQuery = query(collection(merchantDb, 'reviews'), where('storeId', '==', 'store-owned'))
  const snapshot = await assertSucceeds(getDocs(storeQuery))
  assert.ok(snapshot.docs.some((item) => item.id === 'hidden'))
})

test('an authenticated customer can create the exact storefront review payload', async () => {
  await assertSucceeds(
    createApprovedReview(
      customerDb,
      'customer-valid',
      createPayload({ productId: 'product-create' }),
      {
      ratingSum: 0,
      ratingCount: 0,
      },
    ),
  )
})

test('customers cannot forge customerId or a product/store relationship', async () => {
  await assertFails(
    setDoc(doc(customerDb, 'reviews/forged-customer'), createPayload({ customerId: 'customer-2' })),
  )
  await assertFails(
    setDoc(doc(customerDb, 'reviews/forged-store'), createPayload({ storeId: 'store-foreign' })),
  )
  await assertFails(
    setDoc(doc(customerDb, 'reviews/draft-product'), createPayload({ productId: 'product-draft' })),
  )
})

test('customers cannot create reviews with unauthorized moderation statuses', async () => {
  for (const status of ['pending', 'hidden', 'rejected']) {
    await assertFails(setDoc(doc(customerDb, `reviews/forged-status-${status}`), createPayload({ status })))
  }
})

test('customers cannot forge merchant reply, verification, or system/admin fields', async () => {
  const forgedPayloads = [
    { reply: { text: 'Forged merchant reply', at: Date.now() } },
    { orderId: 'forged-verified-order' },
    { reported: true },
    { helpfulCount: 99 },
    { adminNotes: 'forged moderation metadata' },
  ]

  for (const [index, forged] of forgedPayloads.entries()) {
    await assertFails(setDoc(doc(customerDb, `reviews/forged-privileged-${index}`), createPayload(forged)))
  }
})

test('customer review creates enforce rating, comment, title, image, and timestamp constraints', async () => {
  const invalidPayloads = [
    { rating: 0 },
    { rating: 6 },
    { rating: 4.5 },
    { comment: '' },
    { title: 'x'.repeat(101) },
    { images: ['1', '2', '3', '4', '5'] },
    { createdAt: FIXED_TIME },
  ]

  for (const [index, invalid] of invalidPayloads.entries()) {
    await assertFails(setDoc(doc(customerDb, `reviews/invalid-shape-${index}`), createPayload(invalid)))
  }
})

test('review authors cannot edit content, change status, or delete reviews', async () => {
  await assertFails(
    updateDoc(doc(customerDb, 'reviews/approved'), {
      comment: 'Arbitrary author edit',
      updatedAt: serverTimestamp(),
    }),
  )
  await assertFails(
    updateDoc(doc(customerDb, 'reviews/approved'), {
      status: 'hidden',
      updatedAt: serverTimestamp(),
    }),
  )
  await assertFails(deleteDoc(doc(customerDb, 'reviews/approved')))
})

test('owning merchants can reply and moderate using only the supported fields', async () => {
  await assertSucceeds(
    updateDoc(doc(merchantDb, 'reviews/merchant-reply'), {
      reply: { text: 'A legitimate merchant reply.', at: Date.now() },
      updatedAt: serverTimestamp(),
    }),
  )
  await assertSucceeds(
    setReviewStatus(
      merchantDb,
      'merchant-status',
      'hidden',
      'product-owned',
      { ratingSum: 25, ratingCount: 5 },
      5,
      2,
    ),
  )
  await assertSucceeds(
    updateDoc(doc(merchantDb, 'reviews/merchant-status'), {
      status: 'rejected',
      updatedAt: serverTimestamp(),
    }),
  )
  await assertSucceeds(
    setReviewStatus(
      merchantDb,
      'merchant-status',
      'approved',
      'product-owned',
      { ratingSum: 20, ratingCount: 4 },
      5,
      3,
    ),
  )
})

test('merchants cannot mutate protected review identity or customer content', async () => {
  const protectedMutations = [
    { customerId: 'merchant-1' },
    { productId: 'product-foreign' },
    { storeId: 'store-foreign' },
    { rating: 1 },
    { title: 'Merchant rewrite' },
    { comment: 'Merchant rewrite' },
    { orderId: 'merchant-forged-order' },
    { helpfulCount: 500 },
    { reported: false },
  ]

  for (const mutation of protectedMutations) {
    await assertFails(
      updateDoc(doc(merchantDb, 'reviews/approved'), {
        ...mutation,
        updatedAt: serverTimestamp(),
      }),
    )
  }
})

test('merchants cannot modify or delete reviews belonging to another store', async () => {
  await assertFails(
    updateDoc(doc(merchantDb, 'reviews/foreign'), {
      status: 'hidden',
      updatedAt: serverTimestamp(),
    }),
  )
  await assertFails(
    updateDoc(doc(foreignMerchantDb, 'reviews/approved'), {
      reply: { text: 'Cross-store reply', at: Date.now() },
      updatedAt: serverTimestamp(),
    }),
  )
  await assertFails(deleteDoc(doc(merchantDb, 'reviews/approved')))
})

test('signed-in storefront users retain the constrained report operation', async () => {
  await assertSucceeds(
    updateDoc(doc(otherCustomerDb, 'reviews/interactions'), {
      reported: true,
      updatedAt: serverTimestamp(),
    }),
  )
  await assertFails(
    updateDoc(doc(otherCustomerDb, 'reviews/interactions'), {
      reported: false,
      updatedAt: serverTimestamp(),
    }),
  )
})

test('helpful votes enforce one authenticated user per review and reject forgery', async () => {
  await assertFails(
    updateDoc(doc(customerDb, 'reviews/helpful-a'), {
      helpfulCount: 1,
      updatedAt: serverTimestamp(),
    }),
  )

  await assertFails(helpfulVote(anonymousDb, 'helpful-a', 'customer-1', 1))
  await assertSucceeds(helpfulVote(otherCustomerDb, 'helpful-a', 'customer-2', 1))

  let reviewSnapshot = await getDoc(doc(customerDb, 'reviews/helpful-a'))
  assert.equal(reviewSnapshot.data().helpfulCount, 1)

  await assertFails(helpfulVote(otherCustomerDb, 'helpful-a', 'customer-2', 2))
  reviewSnapshot = await getDoc(doc(customerDb, 'reviews/helpful-a'))
  assert.equal(reviewSnapshot.data().helpfulCount, 1)

  await assertSucceeds(helpfulVote(customerDb, 'helpful-a', 'customer-1', 2))
  reviewSnapshot = await getDoc(doc(customerDb, 'reviews/helpful-a'))
  assert.equal(reviewSnapshot.data().helpfulCount, 2)

  await assertFails(helpfulVote(customerDb, 'helpful-b', 'customer-2', 1))
  await assertFails(
    helpfulVote(customerDb, 'helpful-b', 'customer-1', 1, { reviewId: 'helpful-a' }),
  )

  const removal = writeBatch(otherCustomerDb)
  removal.delete(doc(otherCustomerDb, 'reviews/helpful-a/helpfulVotes/customer-2'))
  removal.update(doc(otherCustomerDb, 'reviews/helpful-a'), {
    helpfulCount: 1,
    updatedAt: serverTimestamp(),
  })
  await assertFails(removal.commit())

  await assertFails(
    updateDoc(doc(adminDb, 'reviews/helpful-a'), {
      helpfulCount: 99,
      updatedAt: serverTimestamp(),
    }),
  )
})

test('approved-review lifecycle atomically maintains a tamper-resistant product aggregate', async () => {
  const productRef = doc(customerDb, 'products/product-integrity')
  const firstId = 'integrity-first'
  const secondId = 'integrity-second'

  const readAggregate = async () => {
    const snapshot = await getDoc(productRef)
    return {
      rating: snapshot.data().rating,
      ratingCount: snapshot.data().ratingCount,
      ratingSum: snapshot.data().ratingSum,
    }
  }

  await assertFails(
    updateDoc(productRef, {
      rating: 5,
      ratingCount: 999,
      ratingSum: 4995,
      updatedAt: serverTimestamp(),
    }),
  )
  await assertFails(
    updateDoc(doc(adminDb, 'products/product-integrity'), {
      rating: 5,
      ratingCount: 999,
      ratingSum: 4995,
      updatedAt: serverTimestamp(),
    }),
  )

  const firstPayload = createPayload({
    productId: 'product-integrity',
    rating: 5,
    title: 'First aggregate review',
  })
  await assertSucceeds(
    createApprovedReview(customerDb, firstId, firstPayload, {
      ratingSum: 0,
      ratingCount: 0,
    }),
  )
  assert.deepEqual(await readAggregate(), { rating: 5, ratingCount: 1, ratingSum: 5 })

  await assertFails(
    createApprovedReview(customerDb, firstId, firstPayload, {
      ratingSum: 5,
      ratingCount: 1,
    }),
  )
  assert.deepEqual(await readAggregate(), { rating: 5, ratingCount: 1, ratingSum: 5 })

  const secondPayload = createPayload({
    productId: 'product-integrity',
    rating: 4,
    title: 'Second aggregate review',
  })
  await assertSucceeds(
    createApprovedReview(customerDb, secondId, secondPayload, {
      ratingSum: 5,
      ratingCount: 1,
    }),
  )
  assert.deepEqual(await readAggregate(), { rating: 4.5, ratingCount: 2, ratingSum: 9 })

  await assertSucceeds(
    setReviewStatus(
      merchantDb,
      secondId,
      'hidden',
      'product-integrity',
      { ratingSum: 9, ratingCount: 2 },
      4,
      2,
    ),
  )
  assert.deepEqual(await readAggregate(), { rating: 5, ratingCount: 1, ratingSum: 5 })

  await assertSucceeds(
    updateDoc(doc(merchantDb, 'reviews', secondId), {
      status: 'rejected',
      updatedAt: serverTimestamp(),
    }),
  )
  assert.deepEqual(await readAggregate(), { rating: 5, ratingCount: 1, ratingSum: 5 })

  await assertSucceeds(
    setReviewStatus(
      adminDb,
      secondId,
      'approved',
      'product-integrity',
      { ratingSum: 5, ratingCount: 1 },
      4,
      3,
    ),
  )
  assert.deepEqual(await readAggregate(), { rating: 4.5, ratingCount: 2, ratingSum: 9 })

  const deletion = writeBatch(adminDb)
  deletion.delete(doc(adminDb, 'reviews', firstId))
  deletion.update(
    doc(adminDb, 'products/product-integrity'),
    aggregateUpdate({ ratingSum: 4, ratingCount: 1 }, firstId, 2),
  )
  await assertSucceeds(deletion.commit())
  assert.deepEqual(await readAggregate(), { rating: 4, ratingCount: 1, ratingSum: 4 })

  const forgedTransition = writeBatch(customerDb)
  forgedTransition.set(
    doc(customerDb, 'reviews/integrity-forged'),
    createPayload({ productId: 'product-integrity', rating: 1 }),
  )
  forgedTransition.update(
    productRef,
    aggregateUpdate({ ratingSum: 999, ratingCount: 2 }, 'integrity-forged'),
  )
  await assertFails(forgedTransition.commit())
  assert.deepEqual(await readAggregate(), { rating: 4, ratingCount: 1, ratingSum: 4 })
})

test('admin can moderate any review and is the only role that can delete', async () => {
  await assertSucceeds(
    setReviewStatus(
      adminDb,
      'foreign',
      'hidden',
      'product-foreign',
      { ratingSum: 5, ratingCount: 1 },
      5,
      2,
    ),
  )
  await assertSucceeds(deleteDoc(doc(adminDb, 'reviews/admin-delete')))
  const deleted = await assertSucceeds(getDoc(doc(adminDb, 'reviews/admin-delete')))
  assert.equal(deleted.exists(), false)
})

test('public visibility tracks approved, hidden, rejected, and reapproved transitions', async () => {
  const lifecycleRef = doc(anonymousDb, 'reviews/lifecycle')
  await assertSucceeds(getDoc(lifecycleRef))

  await assertSucceeds(
    setReviewStatus(
      merchantDb,
      'lifecycle',
      'hidden',
      'product-owned',
      { ratingSum: 25, ratingCount: 5 },
      5,
      2,
    ),
  )
  await assertFails(getDoc(lifecycleRef))

  await assertSucceeds(
    updateDoc(doc(merchantDb, 'reviews/lifecycle'), {
      status: 'rejected',
      updatedAt: serverTimestamp(),
    }),
  )
  await assertFails(getDoc(lifecycleRef))

  await assertSucceeds(
    setReviewStatus(
      merchantDb,
      'lifecycle',
      'approved',
      'product-owned',
      { ratingSum: 20, ratingCount: 4 },
      5,
      3,
    ),
  )
  await assertSucceeds(getDoc(lifecycleRef))
})
