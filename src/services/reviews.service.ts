import {
  collection,
  doc,
  limit,
  orderBy,
  runTransaction,
  serverTimestamp,
  where,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { COLLECTIONS } from '@/lib/constants'
import {
  queryDocs,
  updateDocument,
} from '@/services/firestore'
import { stripUndefined } from '@/lib/utils'
import type { Review } from '@/types'

type ProductAggregate = {
  rating: number
  ratingCount: number
  ratingSum: number
}

function readProductAggregate(data: Record<string, unknown>): ProductAggregate {
  const ratingCount = data.ratingCount
  const ratingSum = data.ratingSum

  if (
    typeof ratingCount !== 'number'
    || !Number.isInteger(ratingCount)
    || ratingCount < 0
    || typeof ratingSum !== 'number'
    || !Number.isInteger(ratingSum)
    || ratingSum < 0
  ) {
    throw new Error(
      'This product needs the trusted ratingSum migration before reviews can be changed.',
    )
  }

  return {
    rating: ratingCount > 0 ? ratingSum / ratingCount : 0,
    ratingCount,
    ratingSum,
  }
}

function applyRatingDelta(
  aggregate: ProductAggregate,
  ratingDelta: number,
  countDelta: number,
): ProductAggregate {
  const ratingSum = aggregate.ratingSum + ratingDelta
  const ratingCount = aggregate.ratingCount + countDelta

  if (ratingSum < 0 || ratingCount < 0) {
    throw new Error('The stored product rating aggregate is inconsistent.')
  }

  return {
    rating: ratingCount > 0 ? ratingSum / ratingCount : 0,
    ratingCount,
    ratingSum,
  }
}

export const reviewsService = {
  async listAll(count = 200) {
    return queryDocs<Review>(
      COLLECTIONS.reviews,
      orderBy('createdAt', 'desc'),
      limit(count),
    )
  },

  async listForProduct(productId: string) {
    return queryDocs<Review>(
      COLLECTIONS.reviews,
      where('productId', '==', productId),
      where('status', '==', 'approved'),
      orderBy('createdAt', 'desc'),
      limit(50),
    )
  },

  async listForStore(storeId: string) {
    return queryDocs<Review>(
      COLLECTIONS.reviews,
      where('storeId', '==', storeId),
      orderBy('createdAt', 'desc'),
    )
  },

  async listByCustomer(customerId: string) {
    return queryDocs<Review>(
      COLLECTIONS.reviews,
      where('customerId', '==', customerId),
      orderBy('createdAt', 'desc'),
    )
  },

  async create(
    data: Omit<
      Review,
      'id' | 'createdAt' | 'status' | 'helpfulCount' | 'aggregateVersion'
    >,
  ) {
    const reviewRef = doc(collection(db, COLLECTIONS.reviews))
    const productRef = doc(db, COLLECTIONS.products, data.productId)

    await runTransaction(db, async (transaction) => {
      const productSnapshot = await transaction.get(productRef)
      if (!productSnapshot.exists()) throw new Error('Product not found.')

      const nextAggregate = applyRatingDelta(
        readProductAggregate(productSnapshot.data()),
        data.rating,
        1,
      )

      transaction.set(reviewRef, {
        ...stripUndefined(data as unknown as Record<string, unknown>),
        status: 'approved',
        helpfulCount: 0,
        aggregateVersion: 1,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
      transaction.update(productRef, {
        ...nextAggregate,
        ratingReviewId: reviewRef.id,
        ratingReviewVersion: 1,
        updatedAt: serverTimestamp(),
      })
    })

    return reviewRef.id
  },

  async setStatus(
    review: Review,
    status: Review['status'],
  ) {
    const reviewRef = doc(db, COLLECTIONS.reviews, review.id)

    await runTransaction(db, async (transaction) => {
      const reviewSnapshot = await transaction.get(reviewRef)
      if (!reviewSnapshot.exists()) throw new Error('Review not found.')

      const storedReview = reviewSnapshot.data() as Review
      if (storedReview.status === status) return

      const wasApproved = storedReview.status === 'approved'
      const willBeApproved = status === 'approved'

      if (wasApproved !== willBeApproved) {
        const productRef = doc(db, COLLECTIONS.products, storedReview.productId)
        const productSnapshot = await transaction.get(productRef)
        if (!productSnapshot.exists()) throw new Error('Product not found.')

        const direction = willBeApproved ? 1 : -1
        const aggregateVersion = storedReview.aggregateVersion + 1
        const nextAggregate = applyRatingDelta(
          readProductAggregate(productSnapshot.data()),
          direction * storedReview.rating,
          direction,
        )
        transaction.update(productRef, {
          ...nextAggregate,
          ratingReviewId: review.id,
          ratingReviewVersion: aggregateVersion,
          updatedAt: serverTimestamp(),
        })
        transaction.update(reviewRef, {
          status,
          aggregateVersion,
          updatedAt: serverTimestamp(),
        })
        return
      }

      transaction.update(reviewRef, {
        status,
        updatedAt: serverTimestamp(),
      })
    })
  },

  async reply(id: string, text: string) {
    await updateDocument(
      COLLECTIONS.reviews,
      id,
      {
        reply: {
          text,
          at: Date.now(),
        },
      },
    )
  },

  async markHelpful(id: string, userId: string) {
    const reviewRef = doc(db, COLLECTIONS.reviews, id)
    const voteRef = doc(reviewRef, 'helpfulVotes', userId)

    return runTransaction(db, async (transaction) => {
      const [reviewSnapshot, voteSnapshot] = await Promise.all([
        transaction.get(reviewRef),
        transaction.get(voteRef),
      ])

      if (!reviewSnapshot.exists()) throw new Error('Review not found.')
      if (voteSnapshot.exists()) return false

      transaction.set(voteRef, {
        reviewId: id,
        userId,
        createdAt: serverTimestamp(),
      })
      transaction.update(reviewRef, {
        helpfulCount: (reviewSnapshot.data().helpfulCount ?? 0) + 1,
        updatedAt: serverTimestamp(),
      })
      return true
    })
  },

  async report(id: string) {
    await updateDocument(
      COLLECTIONS.reviews,
      id,
      { reported: true },
    )
  },

  async remove(review: Review) {
    const reviewRef = doc(db, COLLECTIONS.reviews, review.id)

    await runTransaction(db, async (transaction) => {
      const reviewSnapshot = await transaction.get(reviewRef)
      if (!reviewSnapshot.exists()) return

      const storedReview = reviewSnapshot.data() as Review
      if (storedReview.status === 'approved') {
        const productRef = doc(db, COLLECTIONS.products, storedReview.productId)
        const productSnapshot = await transaction.get(productRef)
        if (!productSnapshot.exists()) throw new Error('Product not found.')

        const nextAggregate = applyRatingDelta(
          readProductAggregate(productSnapshot.data()),
          -storedReview.rating,
          -1,
        )
        transaction.update(productRef, {
          ...nextAggregate,
          ratingReviewId: review.id,
          ratingReviewVersion: storedReview.aggregateVersion + 1,
          updatedAt: serverTimestamp(),
        })
      }

      transaction.delete(reviewRef)
    })
  },
}
