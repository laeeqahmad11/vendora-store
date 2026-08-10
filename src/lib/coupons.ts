import type { CartItem, Coupon } from '@/types'

export interface CouponValidationOptions {
  now?: number
  storeId?: string
  customerUsageCount?: number
}

export interface CouponAllocationGroup {
  storeId: string
  items: CartItem[]
  subtotal: number
}

function eligibleItems(coupon: Coupon, items: CartItem[]) {
  const productIds = coupon.appliesTo?.productIds

  return productIds?.length
    ? items.filter((item) => productIds.includes(item.productId))
    : items
}

export function couponEligibleSubtotal(coupon: Coupon, items: CartItem[]) {
  return eligibleItems(coupon, items).reduce(
    (sum, item) => sum + item.price * item.quantity,
    0,
  )
}

export function validateAndCalculateCoupon(
  coupon: Coupon,
  items: CartItem[],
  options: CouponValidationOptions = {},
): number {
  const now = options.now ?? Date.now()

  if (!coupon.active) throw new Error('This promo code is not valid.')
  if (coupon.storeId && coupon.storeId !== options.storeId) {
    throw new Error('This promo code is not valid.')
  }
  if (coupon.startsAt && now < coupon.startsAt) {
    throw new Error('This promo code is not active yet.')
  }
  if (coupon.expiresAt && now > coupon.expiresAt) {
    throw new Error('This promo code has expired.')
  }
  if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) {
    throw new Error('This promo code has reached its usage limit.')
  }
  if (
    coupon.perCustomerLimit &&
    (options.customerUsageCount ?? 0) >= coupon.perCustomerLimit
  ) {
    throw new Error(
      'You have already reached the usage limit for this promo code.',
    )
  }

  const eligible = eligibleItems(coupon, items)
  const eligibleSubtotal = couponEligibleSubtotal(coupon, items)

  if (!eligibleSubtotal) {
    throw new Error('This promo code does not apply to items in your cart.')
  }
  if (coupon.minOrderAmount && eligibleSubtotal < coupon.minOrderAmount) {
    throw new Error(
      `This code requires a minimum order of ${coupon.minOrderAmount.toFixed(2)}.`,
    )
  }

  let discount = 0
  switch (coupon.type) {
    case 'percentage':
      discount = (eligibleSubtotal * coupon.value) / 100
      break
    case 'fixed':
    case 'first_order':
      discount = coupon.value
      break
    case 'bogo':
      // Existing behavior: the cheapest eligible unit is free.
      discount = Math.min(...eligible.map((item) => item.price))
      break
  }

  if (coupon.maxDiscount) discount = Math.min(discount, coupon.maxDiscount)

  return Math.min(Math.round(discount * 100) / 100, eligibleSubtotal)
}

/**
 * Allocates one redemption across store orders. Product-restricted coupons are
 * weighted only by eligible merchandise, and the final group receives the
 * rounding remainder so the persisted discounts always equal the redemption.
 */
export function allocateCouponDiscount(
  coupon: Coupon,
  totalDiscount: number,
  groups: CouponAllocationGroup[],
): Map<string, number> {
  const eligibleByStore = groups.map((group) => ({
    group,
    eligibleSubtotal:
      coupon.storeId && coupon.storeId !== group.storeId
        ? 0
        : eligibleItems(coupon, group.items).reduce(
            (sum, item) => sum + item.price * item.quantity,
            0,
          ),
  }))
  const eligibleGroups = eligibleByStore.filter(
    ({ eligibleSubtotal }) => eligibleSubtotal > 0,
  )
  const totalEligible = eligibleGroups.reduce(
    (sum, item) => sum + item.eligibleSubtotal,
    0,
  )
  const allocations = new Map(groups.map((group) => [group.storeId, 0]))

  if (!totalEligible || !totalDiscount) return allocations

  let allocated = 0
  eligibleGroups.forEach(({ group, eligibleSubtotal }, index) => {
    const isLast = index === eligibleGroups.length - 1
    const share = isLast
      ? Math.round((totalDiscount - allocated) * 100) / 100
      : Math.round(
          ((totalDiscount * eligibleSubtotal) / totalEligible) * 100,
        ) / 100
    const safeShare = Math.min(share, eligibleSubtotal, group.subtotal)
    allocations.set(group.storeId, safeShare)
    allocated = Math.round((allocated + safeShare) * 100) / 100
  })

  return allocations
}
