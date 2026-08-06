import {
  increment,
  limit,
  orderBy,
  where,
  type QueryConstraint,
} from 'firebase/firestore'

import { COLLECTIONS } from '@/lib/constants'
import {
  createDocument,
  deleteDocument,
  queryDocs,
  updateDocument,
} from '@/services/firestore'

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

    if (!coupon || !coupon.active) {
      throw new Error(
        'This promo code is not valid.',
      )
    }

    const now = Date.now()

    if (
      coupon.startsAt &&
      now < coupon.startsAt
    ) {
      throw new Error(
        'This promo code is not active yet.',
      )
    }

    if (
      coupon.expiresAt &&
      now > coupon.expiresAt
    ) {
      throw new Error(
        'This promo code has expired.',
      )
    }

    if (
      coupon.usageLimit &&
      coupon.usedCount >= coupon.usageLimit
    ) {
      throw new Error(
        'This promo code has reached its usage limit.',
      )
    }

    /*
     * Check usage by the currently signed-in customer.
     */
    if (
      customerId &&
      coupon.perCustomerLimit
    ) {
      const customerUsageCount =
        await this.getCustomerCouponUsageCount(
          coupon.id,
          customerId,
        )

      if (
        customerUsageCount >=
        coupon.perCustomerLimit
      ) {
        throw new Error(
          'You have already reached the usage limit for this promo code.',
        )
      }
    }

    let eligibleItems = items

    if (
      coupon.appliesTo?.productIds?.length
    ) {
      eligibleItems = items.filter((item) =>
        coupon.appliesTo?.productIds?.includes(
          item.productId,
        ),
      )
    }

    const eligibleSubtotal =
      eligibleItems.reduce(
        (sum, item) =>
          sum + item.price * item.quantity,
        0,
      )

    if (!eligibleSubtotal) {
      throw new Error(
        'This promo code does not apply to items in your cart.',
      )
    }

    if (
      coupon.minOrderAmount &&
      eligibleSubtotal <
        coupon.minOrderAmount
    ) {
      throw new Error(
        `This code requires a minimum order of ${coupon.minOrderAmount.toFixed(
          2,
        )}.`,
      )
    }

    let discount = 0

    switch (coupon.type) {
      case 'percentage':
        discount =
          (eligibleSubtotal * coupon.value) /
          100
        break

      case 'fixed':
      case 'first_order':
        discount = coupon.value
        break

      case 'bogo': {
        /*
         * Current BOGO behaviour:
         * the cheapest eligible unit is free.
         */
        const cheapestEligiblePrice =
          Math.min(
            ...eligibleItems.map(
              (item) => item.price,
            ),
          )

        discount = cheapestEligiblePrice
        break
      }

      default:
        discount = 0
    }

    if (coupon.maxDiscount) {
      discount = Math.min(
        discount,
        coupon.maxDiscount,
      )
    }

    discount = Math.min(
      Math.round(discount * 100) / 100,
      eligibleSubtotal,
    )

    return {
      coupon,
      discount,
    }
  },

  /**
   * Consumes the coupon after the order was created.
   *
   * It:
   * 1. saves usage against the customer;
   * 2. increments the coupon's total usedCount.
   */
  async consumeCoupon(
    coupon: Coupon,
    customerId: string,
    orderIds: string[],
  ) {
    if (!customerId) {
      throw new Error(
        'Customer ID is required to record coupon usage.',
      )
    }

    /*
     * Validate the per-customer limit again immediately
     * before recording usage.
     */
    if (coupon.perCustomerLimit) {
      const customerUsageCount =
        await this.getCustomerCouponUsageCount(
          coupon.id,
          customerId,
        )

      if (
        customerUsageCount >=
        coupon.perCustomerLimit
      ) {
        throw new Error(
          'You have already reached the usage limit for this promo code.',
        )
      }
    }

    await createDocument<CouponUsage>(
      COUPON_USAGES_COLLECTION,
      {
        couponId: coupon.id,
        couponCode: coupon.code,
        customerId,
        orderIds,
      } as Omit<
        CouponUsage,
        'id' | 'createdAt' | 'updatedAt'
      >,
    )

    await updateDocument(
      COLLECTIONS.coupons,
      coupon.id,
      {
        usedCount: increment(1),
      },
    )
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