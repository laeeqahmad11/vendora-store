import { domainFail } from './errors.js'

export function money(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

export function finiteMoney(value, message, fail = domainFail) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    fail('failed-precondition', message)
  }
  return money(value)
}

export function timestampMillis(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : undefined
}

export function currentProductPrice(product, variantId, now, unavailableMessage, fail = domainFail) {
  const variant = variantId ? product.variants?.find((candidate) => candidate?.id === variantId) : undefined

  if (variantId && !variant) fail('failed-precondition', unavailableMessage)
  if (variant?.price != null) {
    return { price: finiteMoney(variant.price, unavailableMessage, fail), variant }
  }
  if (product.flashSale?.active === true && timestampMillis(product.flashSale.endsAt) > now) {
    return {
      price: finiteMoney(product.flashSale.salePrice, unavailableMessage, fail),
      variant,
    }
  }
  return { price: finiteMoney(product.price, unavailableMessage, fail), variant }
}

export function couponEligibleItems(coupon, items) {
  const productIds = coupon.appliesTo?.productIds
  return Array.isArray(productIds) && productIds.length
    ? items.filter((item) => productIds.includes(item.productId))
    : items
}

export function couponEligibleSubtotal(coupon, items) {
  return money(couponEligibleItems(coupon, items).reduce((sum, item) => sum + item.price * item.quantity, 0))
}

export function calculateCoupon(
  coupon,
  items,
  { now, storeId, customerUsageCount, hasQualifyingPriorOrder = false },
  fail = domainFail,
) {
  if (coupon.active !== true) fail('failed-precondition', 'This promo code is not valid.')
  if (coupon.storeId && coupon.storeId !== storeId) {
    fail('failed-precondition', 'This promo code is not valid.')
  }
  const startsAt = timestampMillis(coupon.startsAt)
  const expiresAt = timestampMillis(coupon.expiresAt)
  if (startsAt && now < startsAt) {
    fail('failed-precondition', 'This promo code is not active yet.')
  }
  if (expiresAt && now > expiresAt) {
    fail('failed-precondition', 'This promo code has expired.')
  }

  const usedCount = Number(coupon.usedCount)
  if (!Number.isSafeInteger(usedCount) || usedCount < 0) {
    fail('failed-precondition', 'This promo code is not valid.')
  }
  if (coupon.usageLimit && usedCount >= coupon.usageLimit) {
    fail('resource-exhausted', 'This promo code has reached its usage limit.')
  }
  if (coupon.perCustomerLimit && customerUsageCount >= coupon.perCustomerLimit) {
    fail('resource-exhausted', 'You have already reached the usage limit for this promo code.')
  }
  if (coupon.type === 'first_order' && hasQualifyingPriorOrder) {
    fail('failed-precondition', 'This promo code is only valid on your first order.')
  }

  const eligible = couponEligibleItems(coupon, items)
  const eligibleSubtotal = couponEligibleSubtotal(coupon, items)
  if (!eligibleSubtotal) {
    fail('failed-precondition', 'This promo code does not apply to items in your cart.')
  }
  if (coupon.minOrderAmount && eligibleSubtotal < coupon.minOrderAmount) {
    fail(
      'failed-precondition',
      `This code requires a minimum order of ${Number(coupon.minOrderAmount).toFixed(2)}.`,
    )
  }

  let discount
  switch (coupon.type) {
    case 'percentage':
      discount = (eligibleSubtotal * coupon.value) / 100
      break
    case 'fixed':
    case 'first_order':
      discount = coupon.value
      break
    case 'bogo':
      discount = Math.min(...eligible.map((item) => item.price))
      break
    default:
      fail('failed-precondition', 'This promo code is not valid.')
  }

  discount = finiteMoney(discount, 'This promo code is not valid.', fail)
  if (coupon.maxDiscount) discount = Math.min(discount, coupon.maxDiscount)
  return Math.min(money(discount), eligibleSubtotal)
}

export function allocateCoupon(coupon, totalDiscount, groups) {
  const eligible = groups
    .map((group) => ({
      group,
      eligibleSubtotal:
        coupon.storeId && coupon.storeId !== group.storeId ? 0 : couponEligibleSubtotal(coupon, group.items),
    }))
    .filter(({ eligibleSubtotal }) => eligibleSubtotal > 0)
  const totalEligible = money(eligible.reduce((sum, entry) => sum + entry.eligibleSubtotal, 0))
  const result = new Map(groups.map((group) => [group.storeId, 0]))
  let allocated = 0

  eligible.forEach(({ group, eligibleSubtotal }, index) => {
    const share =
      index === eligible.length - 1
        ? money(totalDiscount - allocated)
        : money((totalDiscount * eligibleSubtotal) / totalEligible)
    const safeShare = Math.min(share, eligibleSubtotal, group.subtotal)
    result.set(group.storeId, safeShare)
    allocated = money(allocated + safeShare)
  })
  return result
}

export function calculateShippingFee(store, subtotal, unavailableMessage, fail = domainFail) {
  const shippingFee = finiteMoney(store.shippingFee ?? 0, unavailableMessage, fail)
  const threshold = finiteMoney(store.freeShippingThreshold ?? 0, unavailableMessage, fail)
  return store.shippingEnabled === false || (threshold > 0 && subtotal >= threshold) ? 0 : shippingFee
}
