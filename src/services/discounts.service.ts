import { limit, orderBy, where, type QueryConstraint } from 'firebase/firestore'

import { COLLECTIONS } from '@/lib/constants'
import {
  createDocument,
  deleteDocument,
  queryDocs,
  updateDocument,
} from '@/services/firestore'
import { validateAndCalculateCoupon } from '@/lib/coupons'

import type {
  CartItem,
  Coupon,
  Promotion,
} from '@/types'

const COUPON_USAGES_COLLECTION = 'couponUsages'

export interface CouponResult {
  coupon: Coupon
  discount: number
}

interface CouponUsage {
  id: string
  couponId: string
  couponCode: string
  customerId: string
  orderIds: string[]
  createdAt: number
  updatedAt: number
}

export const discountsService = {
  // --------------------------------------------------------------- coupons

  async listCoupons(storeId?: string) {
    const constraints: QueryConstraint[] = [
      orderBy('createdAt', 'desc'),
    ]

    if (storeId) {
      constraints.unshift(
        where('storeId', '==', storeId),
      )
    }

    return queryDocs<Coupon>(
      COLLECTIONS.coupons,
      ...constraints,
    )
  },

  async createCoupon(
    data: Omit<
      Coupon,
      'id' | 'createdAt' | 'usedCount'
    >,
  ) {
    return createDocument<Coupon>(
      COLLECTIONS.coupons,
      {
        ...data,
        code: data.code.toUpperCase().trim(),
        usedCount: 0,
      } as Omit<
        Coupon,
        'id' | 'createdAt' | 'updatedAt'
      >,
    )
  },

  async updateCoupon(
    id: string,
    data: Partial<Coupon>,
  ) {
    await updateDocument(
      COLLECTIONS.coupons,
      id,
      data,
    )
  },

  async deleteCoupon(id: string) {
    await deleteDocument(
      COLLECTIONS.coupons,
      id,
    )
  },

  /**
   * Returns how many times the given customer has used
   * a particular coupon.
   */
  async getCustomerCouponUsageCount(
    couponId: string,
    customerId: string,
  ): Promise<number> {
    const usages = await queryDocs<CouponUsage>(
      COUPON_USAGES_COLLECTION,
      where('couponId', '==', couponId),
      where('customerId', '==', customerId),
    )

    return usages.length
  },

  /**
   * Validates a coupon against the supplied cart items.
   *
   * When customerId is supplied, per-customer limits
   * are also checked.
   */
  async validateCoupon(
    code: string,
    items: CartItem[],
    storeId?: string,
    customerId?: string,
  ): Promise<CouponResult> {
    const normalizedCode =
      code.toUpperCase().trim()

    const matches = await queryDocs<Coupon>(
      COLLECTIONS.coupons,
      where('code', '==', normalizedCode),
      limit(5),
    )

    /*
     * Prefer a coupon belonging to the current store.
     * Otherwise use a platform-wide coupon.
     */
    const coupon =
      matches.find(
        (item) =>
          Boolean(storeId) &&
          item.storeId === storeId,
      ) ??
      matches.find(
        (item) => !item.storeId,
      )

    if (!coupon) throw new Error('This promo code is not valid.')

    /*
     * Check usage by the currently signed-in customer.
     */
    const customerUsageCount =
      customerId && coupon.perCustomerLimit
        ? await this.getCustomerCouponUsageCount(coupon.id, customerId)
        : 0

    const discount = validateAndCalculateCoupon(coupon, items, {
      storeId,
      customerUsageCount,
    })

    return {
      coupon,
      discount,
    }
  },

  // ------------------------------------------------------------ promotions

  async listPromotions(storeId?: string) {
    const constraints: QueryConstraint[] = [
      orderBy('createdAt', 'desc'),
    ]

    if (storeId) {
      constraints.unshift(
        where('storeId', '==', storeId),
      )
    }

    return queryDocs<Promotion>(
      COLLECTIONS.promotions,
      ...constraints,
    )
  },

  async listActivePromotions(
    placement?: Promotion['placement'],
  ) {
    const items =
      await queryDocs<Promotion>(
        COLLECTIONS.promotions,
        where('active', '==', true),
      )

    const now = Date.now()

    return items
      .filter(
        (promotion) =>
          promotion.startsAt <= now &&
          promotion.endsAt >= now,
      )
      .filter(
        (promotion) =>
          !placement ||
          promotion.placement === placement,
      )
      .sort(
        (first, second) =>
          (first.sortOrder ?? 0) -
          (second.sortOrder ?? 0),
      )
  },

  async createPromotion(
    data: Omit<
      Promotion,
      'id' | 'createdAt'
    >,
  ) {
    return createDocument<Promotion>(
      COLLECTIONS.promotions,
      data as Omit<
        Promotion,
        | 'id'
        | 'createdAt'
        | 'updatedAt'
      >,
    )
  },

  async updatePromotion(
    id: string,
    data: Partial<Promotion>,
  ) {
    await updateDocument(
      COLLECTIONS.promotions,
      id,
      data,
    )
  },

  async deletePromotion(id: string) {
    await deleteDocument(
      COLLECTIONS.promotions,
      id,
    )
  },
}
