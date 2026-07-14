import { increment, orderBy, where, limit, type QueryConstraint } from 'firebase/firestore'
import { COLLECTIONS } from '@/lib/constants'
import { createDocument, deleteDocument, queryDocs, updateDocument } from '@/services/firestore'
import type { CartItem, Coupon, Promotion } from '@/types'

export interface CouponResult {
  coupon: Coupon
  discount: number
}

export const discountsService = {
  // ---------------------------------------------------------------- coupons
  async listCoupons(storeId?: string) {
    const constraints: QueryConstraint[] = [orderBy('createdAt', 'desc')]
    if (storeId) constraints.unshift(where('storeId', '==', storeId))
    return queryDocs<Coupon>(COLLECTIONS.coupons, ...constraints)
  },

  async createCoupon(data: Omit<Coupon, 'id' | 'createdAt' | 'usedCount'>) {
    return createDocument<Coupon>(COLLECTIONS.coupons, {
      ...data,
      code: data.code.toUpperCase().trim(),
      usedCount: 0,
    } as Omit<Coupon, 'id' | 'createdAt' | 'updatedAt'>)
  },

  async updateCoupon(id: string, data: Partial<Coupon>) {
    await updateDocument(COLLECTIONS.coupons, id, data)
  },

  async deleteCoupon(id: string) {
    await deleteDocument(COLLECTIONS.coupons, id)
  },

  /**
   * Validates a code against the given cart items (single store's subtotal)
   * and returns the computed discount. Throws with a user-readable message
   * when invalid.
   */
  async validateCoupon(code: string, items: CartItem[], storeId?: string): Promise<CouponResult> {
    const matches = await queryDocs<Coupon>(
      COLLECTIONS.coupons,
      where('code', '==', code.toUpperCase().trim()),
      limit(5),
    )
    // Prefer a store-scoped coupon matching this cart, else a platform-wide one
    const coupon = matches.find((c) => c.storeId === storeId) ?? matches.find((c) => !c.storeId)
    if (!coupon || !coupon.active) throw new Error('This promo code is not valid.')

    const now = Date.now()
    if (coupon.startsAt && now < coupon.startsAt) throw new Error('This promo code is not active yet.')
    if (coupon.expiresAt && now > coupon.expiresAt) throw new Error('This promo code has expired.')
    if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit)
      throw new Error('This promo code has reached its usage limit.')

    let eligible = items
    if (coupon.appliesTo?.productIds?.length) {
      eligible = items.filter((i) => coupon.appliesTo!.productIds!.includes(i.productId))
    }
    const subtotal = eligible.reduce((s, i) => s + i.price * i.quantity, 0)
    if (!subtotal) throw new Error('This promo code does not apply to items in your cart.')
    if (coupon.minOrderAmount && subtotal < coupon.minOrderAmount)
      throw new Error(`This code requires a minimum order of ${coupon.minOrderAmount.toFixed(2)}.`)

    let discount = 0
    switch (coupon.type) {
      case 'percentage':
        discount = (subtotal * coupon.value) / 100
        break
      case 'fixed':
      case 'first_order':
        discount = coupon.value
        break
      case 'bogo': {
        // Cheapest eligible unit free
        const cheapest = Math.min(...eligible.map((i) => i.price))
        discount = cheapest
        break
      }
    }
    if (coupon.maxDiscount) discount = Math.min(discount, coupon.maxDiscount)
    discount = Math.min(Math.round(discount * 100) / 100, subtotal)

    return { coupon, discount }
  },

  async consumeCoupon(id: string) {
    await updateDocument(COLLECTIONS.coupons, id, { usedCount: increment(1) }).catch(() => {})
  },

  // ------------------------------------------------------------- promotions
  async listPromotions(storeId?: string) {
    const constraints: QueryConstraint[] = [orderBy('createdAt', 'desc')]
    if (storeId) constraints.unshift(where('storeId', '==', storeId))
    return queryDocs<Promotion>(COLLECTIONS.promotions, ...constraints)
  },

  async listActivePromotions(placement?: Promotion['placement']) {
    const items = await queryDocs<Promotion>(COLLECTIONS.promotions, where('active', '==', true))
    const now = Date.now()
    return items
      .filter((p) => p.startsAt <= now && p.endsAt >= now)
      .filter((p) => !placement || p.placement === placement)
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
  },

  async createPromotion(data: Omit<Promotion, 'id' | 'createdAt'>) {
    return createDocument<Promotion>(COLLECTIONS.promotions, data as Omit<Promotion, 'id' | 'createdAt' | 'updatedAt'>)
  },

  async updatePromotion(id: string, data: Partial<Promotion>) {
    await updateDocument(COLLECTIONS.promotions, id, data)
  },

  async deletePromotion(id: string) {
    await deleteDocument(COLLECTIONS.promotions, id)
  },
}
