import { domainFail } from './errors.js'
import { authoritativeProductInventory } from './inventory.js'

export const MERCHANT_FULFILLMENT_TRANSITIONS = Object.freeze({
  pending: 'confirmed',
  confirmed: 'packed',
  packed: 'ready',
  ready: 'dispatched',
  dispatched: 'delivered',
})

export function assertMerchantFulfillmentTransition(currentStatus, nextStatus, fail = domainFail) {
  if (MERCHANT_FULFILLMENT_TRANSITIONS[currentStatus] !== nextStatus) {
    fail('failed-precondition', `Order cannot transition from ${currentStatus} to ${nextStatus}.`)
  }
}

export function assertCashConfirmationAllowed(order, fail = domainFail) {
  if (order.status !== 'delivered' || order.paymentMethod !== 'cod' || order.cashReceived !== false) {
    fail('failed-precondition', 'Cash can only be confirmed once for a delivered COD order.')
  }
}

export function assertReturnRequestAllowed(status, fail = domainFail) {
  if (!['delivered', 'completed'].includes(status)) {
    fail('failed-precondition', 'Returns can only be requested after delivery.')
  }
}

export function assertReturnDecision(decision, fail = domainFail) {
  if (!['approve', 'decline'].includes(decision)) fail('invalid-argument', 'Decision is invalid.')
}

export function returnDecisionStatus(currentStatus, decision, fail = domainFail) {
  assertReturnDecision(decision, fail)
  if (currentStatus !== 'refund_requested') {
    fail('failed-precondition', 'Only a pending refund request can be reviewed.')
  }
  return decision === 'approve' ? 'returned' : 'completed'
}

export function assertCancellationAllowed(status, fail = domainFail) {
  if (!['pending', 'confirmed'].includes(status)) {
    fail('failed-precondition', 'Only pending or confirmed orders can be cancelled.')
  }
}

export function collectCancellationInventory(items, fail = domainFail) {
  const quantities = new Map()
  const variantQuantities = new Map()
  const productPoolQuantities = new Map()
  for (const item of items ?? []) {
    if (!item?.productId || !Number.isSafeInteger(item.quantity) || item.quantity <= 0) {
      fail('failed-precondition', 'Order inventory details are invalid.')
    }
    quantities.set(item.productId, (quantities.get(item.productId) ?? 0) + item.quantity)
    if (item.inventoryAuthority === 'variant') {
      if (typeof item.variantId !== 'string' || !item.variantId) {
        fail('failed-precondition', 'Order inventory details are invalid.')
      }
      const key = `${item.productId}\u0000${item.variantId}`
      variantQuantities.set(key, (variantQuantities.get(key) ?? 0) + item.quantity)
    } else if (item.inventoryAuthority === undefined || item.inventoryAuthority === 'product') {
      productPoolQuantities.set(
        item.productId,
        (productPoolQuantities.get(item.productId) ?? 0) + item.quantity,
      )
    } else {
      fail('failed-precondition', 'Order inventory details are invalid.')
    }
  }
  return { quantities, variantQuantities, productPoolQuantities }
}

export function restoreCancelledProductInventory(
  product,
  productId,
  quantity,
  variantQuantities,
  productPoolQuantity,
  fail = domainFail,
) {
  const stock = Number(product.stock)
  const soldCount = Number(product.soldCount)
  if (!Number.isSafeInteger(stock) || !Number.isSafeInteger(soldCount) || soldCount < quantity) {
    fail('failed-precondition', 'Order inventory details are invalid.')
  }
  const variantRestorations = [...variantQuantities.entries()]
    .filter(([key]) => key.startsWith(`${productId}\u0000`))
    .map(([key, restoredQuantity]) => ({
      variantId: key.slice(key.indexOf('\u0000') + 1),
      quantity: restoredQuantity,
    }))
  let variants
  let nextStock = stock + productPoolQuantity
  if (variantRestorations.length) {
    const inventory = authoritativeProductInventory(
      product,
      'Order inventory details are invalid.',
      fail,
    )
    if (!inventory.hasVariants || productPoolQuantity > 0) {
      fail('failed-precondition', 'Order inventory details are invalid.')
    }
    const restorationByVariant = new Map(variantRestorations.map((entry) => [entry.variantId, entry.quantity]))
    if ([...restorationByVariant.keys()].some((variantId) => !inventory.byId.has(variantId))) {
      fail('failed-precondition', 'Order inventory details are invalid.')
    }
    variants = inventory.variants.map((variant) => ({
      ...variant,
      stock: variant.stock + (restorationByVariant.get(variant.id) ?? 0),
    }))
    nextStock = inventory.stock + variantRestorations.reduce((sum, entry) => sum + entry.quantity, 0)
  }
  return { stock: nextStock, soldCount: soldCount - quantity, variants }
}
