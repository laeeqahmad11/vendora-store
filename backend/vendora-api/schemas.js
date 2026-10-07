import { containsControlCharacter, validFirestoreDocumentId } from '../../functions/domain/identifiers.js'
import { MERCHANT_STORE_PROFILE_FIELDS } from '../../functions/domain/stores.js'
import { SafeHttpError } from './http-errors.js'

function invalid(message = 'Request body is invalid.') {
  throw new SafeHttpError('invalid-argument', message)
}

function object(value, allowed, required = []) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) invalid()
  const keys = Object.keys(value)
  if (keys.some((key) => !allowed.includes(key)) || required.some((key) => !keys.includes(key))) {
    invalid('Request body contains unsupported or missing fields.')
  }
  return value
}

function identifier(value, field) {
  if (!validFirestoreDocumentId(value)) invalid(`${field} is invalid.`)
  return value
}

function optionalString(value, field) {
  if (value !== undefined && value !== null && value !== '' && typeof value !== 'string') {
    invalid(`${field} is invalid.`)
  }
}

export function assertOrderId(value) {
  return identifier(value, 'Order ID')
}

export function assertProductId(value) {
  return identifier(value, 'Product ID')
}

export function assertStoreId(value) {
  return identifier(value, 'Store ID')
}

export function assertUserId(value) {
  return identifier(value, 'User ID')
}

export function assertSupportTicketId(value) {
  return identifier(value, 'Support ticket ID')
}

function boundedString(value, field, maximum, { multiline = false } = {}) {
  if (typeof value !== 'string') invalid(`${field} is invalid.`)
  const clean = value.trim()
  const unsafe = multiline
    ? /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(clean)
    : containsControlCharacter(clean)
  if (!clean || clean.length > maximum || unsafe) invalid(`${field} is invalid.`)
  return clean
}

export function createSupportTicketBody(value) {
  object(value, ['subject', 'orderId', 'priority', 'message'], ['subject', 'priority', 'message'])
  const subject = boundedString(value.subject, 'Subject', 120)
  const message = boundedString(value.message, 'Message', 5000, { multiline: true })
  if (!['low', 'medium', 'high'].includes(value.priority)) invalid('Support priority is invalid.')
  let orderId
  if (value.orderId !== undefined) orderId = boundedString(value.orderId, 'Order ID', 128)
  return { subject, ...(orderId ? { orderId } : {}), priority: value.priority, message }
}

export function supportReplyBody(value) {
  object(value, ['text'], ['text'])
  return { text: boundedString(value.text, 'Reply', 5000, { multiline: true }) }
}

export function supportStatusBody(value) {
  object(value, ['status'], ['status'])
  if (!['open', 'in_progress', 'resolved', 'closed'].includes(value.status)) {
    invalid('Support status is invalid.')
  }
  return { status: value.status }
}

export function userRoleBody(value) {
  object(value, ['role'], ['role'])
  if (!['admin', 'customer'].includes(value.role)) invalid('User role is invalid.')
  return value
}

export function userSuspensionBody(value) {
  object(value, ['suspended'], ['suspended'])
  if (typeof value.suspended !== 'boolean') invalid('User suspension is invalid.')
  return value
}

export function checkoutBody(value) {
  object(
    value,
    ['items', 'delivery', 'paymentMethod', 'couponCode', 'specialInstructions', 'giftNote', 'idempotencyKey'],
    ['items', 'delivery', 'paymentMethod', 'idempotencyKey'],
  )
  if (!Array.isArray(value.items)) invalid('Checkout items are invalid.')
  for (const item of value.items) {
    object(item, ['productId', 'variantId', 'quantity'], ['productId', 'quantity'])
    identifier(item.productId, 'Product ID')
    if (item.variantId !== undefined && item.variantId !== null && item.variantId !== '') {
      identifier(item.variantId, 'Variant ID')
    }
  }
  object(value.delivery, ['fullName', 'email', 'phone', 'address'], ['fullName', 'email', 'phone', 'address'])
  object(
    value.delivery.address,
    ['fullName', 'phone', 'line1', 'line2', 'city', 'province', 'postalCode', 'country'],
    ['fullName', 'phone', 'line1', 'city', 'province', 'postalCode', 'country'],
  )
  return value
}

export function couponPreviewBody(value) {
  object(value, ['code', 'items'], ['code', 'items'])
  optionalString(value.code, 'Promo code')
  if (!Array.isArray(value.items)) invalid('Coupon preview items are invalid.')
  for (const item of value.items) {
    object(item, ['productId', 'variantId', 'quantity'], ['productId', 'quantity'])
    identifier(item.productId, 'Product ID')
    if (item.variantId !== undefined && item.variantId !== null && item.variantId !== '') {
      identifier(item.variantId, 'Variant ID')
    }
  }
  return value
}

export function newsletterBody(value) {
  object(value, ['email'], ['email'])
  optionalString(value.email, 'Email')
  return value
}

export function cancelBody(value) {
  object(value, ['reason'], ['reason'])
  optionalString(value.reason, 'Cancellation reason')
  return value
}

export function inventorySetBody(value) {
  object(value, ['productId', 'stock', 'variantStocks'], ['productId'])
  identifier(value.productId, 'Product ID')
  if (value.variantStocks !== undefined) {
    if (!Array.isArray(value.variantStocks)) invalid('Variant inventory is invalid.')
    for (const entry of value.variantStocks) {
      object(entry, ['variantId', 'stock'], ['variantId', 'stock'])
      identifier(entry.variantId, 'Variant ID')
    }
  }
  return value
}

export function inventoryAdjustBody(value) {
  object(value, ['productId', 'variantId', 'change', 'reason', 'note'], ['productId', 'change', 'reason'])
  identifier(value.productId, 'Product ID')
  if (value.variantId !== undefined && value.variantId !== null && value.variantId !== '') {
    identifier(value.variantId, 'Variant ID')
  }
  optionalString(value.note, 'Inventory note')
  return value
}

export function productModerationBody(value) {
  object(value, ['status', 'reason'], ['status'])
  if (!['approved', 'rejected', 'archived'].includes(value.status)) {
    invalid('Product status is invalid.')
  }
  optionalString(value.reason, 'Reason')
  if (typeof value.reason === 'string' && value.reason !== '') {
    const reason = value.reason.trim()
    if (reason.length < 1 || reason.length > 2000) invalid('Reason is invalid.')
    return { status: value.status, reason }
  }
  return { status: value.status }
}

export function storeModerationBody(value) {
  object(value, ['status', 'reason'], ['status'])
  if (!['approved', 'rejected', 'suspended'].includes(value.status)) {
    invalid('Store status is invalid.')
  }
  optionalString(value.reason, 'Reason')
  if (typeof value.reason === 'string' && value.reason !== '') {
    const reason = value.reason.trim()
    if (reason.length < 1 || reason.length > 2000) invalid('Reason is invalid.')
    return { status: value.status, reason }
  }
  return { status: value.status }
}

export function storeVerificationBody(value) {
  object(value, ['verified'], ['verified'])
  if (typeof value.verified !== 'boolean') invalid('Store verification state is invalid.')
  return { verified: value.verified }
}

export function storeProfileBody(value) {
  object(value, MERCHANT_STORE_PROFILE_FIELDS)
  if (Object.keys(value).length === 0) invalid('Store profile update is empty.')
  for (const field of [
    'name', 'description', 'logoUrl', 'bannerUrl', 'businessHours',
    'shippingPolicy', 'estimatedDeliveryDays',
  ]) {
    if (value[field] !== undefined && typeof value[field] !== 'string') {
      invalid(`${field} is invalid.`)
    }
  }
  if (value.shippingEnabled !== undefined && typeof value.shippingEnabled !== 'boolean') {
    invalid('shippingEnabled is invalid.')
  }
  for (const field of ['shippingFee', 'freeShippingThreshold']) {
    if (value[field] !== undefined && (
      typeof value[field] !== 'number' || !Number.isFinite(value[field])
    )) {
      invalid(`${field} is invalid.`)
    }
  }
  if (value.socialLinks !== undefined) {
    object(value.socialLinks, ['facebook', 'instagram', 'twitter', 'website'])
    for (const entry of Object.values(value.socialLinks)) {
      if (typeof entry !== 'string') invalid('Store social link is invalid.')
    }
  }
  if (value.seo !== undefined) {
    object(value.seo, ['title', 'description'])
    for (const entry of Object.values(value.seo)) {
      if (typeof entry !== 'string') invalid('Store SEO data is invalid.')
    }
  }
  return value
}

const COMMAND_FIELDS = Object.freeze({
  transitionOrder: ['command', 'nextStatus', 'note'],
  confirmOrderCash: ['command'],
  requestOrderRefund: ['command', 'reason'],
  decideOrderReturn: ['command', 'decision'],
})

export function orderCommandBody(value) {
  object(value, ['command', 'nextStatus', 'note', 'reason', 'decision'], ['command'])
  if (typeof value.command !== 'string' || !COMMAND_FIELDS[value.command]) {
    invalid('Order command is invalid.')
  }
  const allowed = COMMAND_FIELDS[value.command]
  const required = value.command === 'transitionOrder'
    ? ['command', 'nextStatus']
    : value.command === 'requestOrderRefund'
      ? ['command', 'reason']
      : value.command === 'decideOrderReturn'
        ? ['command', 'decision']
        : ['command']
  object(value, allowed, required)
  if (value.nextStatus !== undefined) identifier(value.nextStatus, 'Next status')
  if (value.decision !== undefined && !['approve', 'decline'].includes(value.decision)) {
    invalid('Order return decision is invalid.')
  }
  optionalString(value.note, 'Order note')
  optionalString(value.reason, 'Return reason')
  return value
}

export function safePathname(url) {
  if (containsControlCharacter(url.pathname)) invalid('Request path is invalid.')
  try {
    return decodeURIComponent(url.pathname)
  } catch {
    invalid('Request path is invalid.')
  }
}
