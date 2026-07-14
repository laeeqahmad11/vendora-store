import { increment, orderBy, where, limit } from 'firebase/firestore'
import { COLLECTIONS } from '@/lib/constants'
import { createDocument, queryDocs, updateDocument, deleteDocument } from '@/services/firestore'
import type { Review } from '@/types'

async function recomputeProductRating(productId: string) {
  const approved = await queryDocs<Review>(
    COLLECTIONS.reviews,
    where('productId', '==', productId),
    where('status', '==', 'approved'),
  )
  const ratingCount = approved.length
  const rating = ratingCount ? approved.reduce((s, r) => s + r.rating, 0) / ratingCount : 0
  await updateDocument(COLLECTIONS.products, productId, {
    rating: Math.round(rating * 10) / 10,
    ratingCount,
  })
}

export const reviewsService = {
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
    return queryDocs<Review>(COLLECTIONS.reviews, where('storeId', '==', storeId), orderBy('createdAt', 'desc'))
  },

  async listByCustomer(customerId: string) {
    return queryDocs<Review>(COLLECTIONS.reviews, where('customerId', '==', customerId), orderBy('createdAt', 'desc'))
  },

  async create(data: Omit<Review, 'id' | 'createdAt' | 'status' | 'helpfulCount'>) {
    // Reviews go live immediately; merchants can hide/report from their dashboard
    const id = await createDocument<Review>(COLLECTIONS.reviews, {
      ...data,
      status: 'approved',
      helpfulCount: 0,
    } as Omit<Review, 'id' | 'createdAt' | 'updatedAt'>)
    await recomputeProductRating(data.productId)
    return id
  },

  async setStatus(review: Review, status: Review['status']) {
    await updateDocument(COLLECTIONS.reviews, review.id, { status })
    await recomputeProductRating(review.productId)
  },

  async reply(id: string, text: string) {
    await updateDocument(COLLECTIONS.reviews, id, { reply: { text, at: Date.now() } })
  },

  async markHelpful(id: string) {
    await updateDocument(COLLECTIONS.reviews, id, { helpfulCount: increment(1) })
  },

  async report(id: string) {
    await updateDocument(COLLECTIONS.reviews, id, { reported: true })
  },

  async remove(review: Review) {
    await deleteDocument(COLLECTIONS.reviews, review.id)
    await recomputeProductRating(review.productId)
  },
}
