import { TRUSTED_SUPPORT_NOTIFICATION_REVISION_FIELD } from './support-notification-guard.js'
import {
  allocateCoupon,
  calculateCoupon,
  calculateShippingFee,
  couponEligibleSubtotal,
  currentProductPrice,
  money,
} from '../domain/checkout.js'
import { domainFail, TrustedDomainError } from '../domain/errors.js'
import { containsControlCharacter, validFirestoreDocumentId } from '../domain/identifiers.js'
import { authoritativeProductInventory } from '../domain/inventory.js'
import {
  MERCHANT_STORE_PROFILE_FIELDS,
  publicStoreProjection,
} from '../domain/stores.js'
import {
  assertCancellationAllowed,
  assertCashConfirmationAllowed,
  assertMerchantFulfillmentTransition,
  assertReturnDecision,
  assertReturnRequestAllowed,
  collectCancellationInventory,
  restoreCancelledProductInventory,
  returnDecisionStatus,
} from '../domain/orders.js'
import {
  assertTransactionPort,
  assertTrustedRepository,
  verifiedPrincipalId,
} from './contracts.js'

const PRODUCT_UNAVAILABLE =
  'One or more products are unavailable or their stock changed. Please review your cart and try again.'
const IDEMPOTENCY_RETENTION_MS = 30 * 24 * 60 * 60 * 1_000
const MAX_ITEMS = 50
const MAX_ITEM_QUANTITY = 1_000
const MAX_CHECKOUT_PAYLOAD_BYTES = 64 * 1024
const INVENTORY_REASONS = Object.freeze(['restock', 'adjustment', 'return'])
const PRODUCT_MODERATION_STATUSES = Object.freeze(['approved', 'rejected', 'archived'])
const STORE_MODERATION_STATUSES = Object.freeze(['approved', 'rejected', 'suspended'])
const USER_PROFILE_ROLES = Object.freeze(['admin', 'merchant', 'customer'])
const SUPPORT_PRIORITIES = Object.freeze(['low', 'medium', 'high'])
const SUPPORT_STATUSES = Object.freeze(['open', 'in_progress', 'resolved', 'closed'])
const checkoutRequestIds = new WeakMap()

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function operationInput(value, allowedKeys) {
  if (!isObject(value) || Object.keys(value).some((key) => !allowedKeys.includes(key))) {
    domainFail('invalid-argument', 'Trusted operation input is invalid.')
  }
  return value
}

function trustedString(value, field, minimum, maximum) {
  if (typeof value !== 'string') domainFail('invalid-argument', `${field} is invalid.`)
  const clean = value.trim()
  if (clean.length < minimum || clean.length > maximum) {
    domainFail('invalid-argument', `${field} is invalid.`)
  }
  return clean
}

function trustedIdentifier(value, field, minimum = 1, maximum = 128) {
  const clean = trustedString(value, field, minimum, maximum)
  if (clean.includes('/') || containsControlCharacter(clean)) {
    domainFail('invalid-argument', `${field} is invalid.`)
  }
  return clean
}

function trustedOptionalString(value, field, minimum, maximum, { singleLine = false } = {}) {
  if (value === undefined || value === null || value === '') return undefined
  const clean = trustedString(value, field, minimum, maximum)
  if (singleLine && /[\r\n]/u.test(clean)) domainFail('invalid-argument', `${field} is invalid.`)
  return clean
}

function trustedSingleLine(value, field, minimum, maximum) {
  const clean = trustedString(value, field, minimum, maximum)
  if (containsControlCharacter(clean)) domainFail('invalid-argument', `${field} is invalid.`)
  return clean
}

function containsUnsafeMultilineControl(value) {
  return /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value)
}

function trustedMultiline(value, field, minimum, maximum) {
  const clean = trustedString(value, field, minimum, maximum)
  if (containsUnsafeMultilineControl(clean)) domainFail('invalid-argument', `${field} is invalid.`)
  return clean
}

function trustedFiniteNumber(value, field, minimum, maximum) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || value > maximum) {
    domainFail('invalid-argument', `${field} is invalid.`)
  }
  return value
}

function trustedProfileObject(value, field, allowedKeys, maximums) {
  const object = operationInput(value, allowedKeys)
  return Object.fromEntries(Object.entries(object).map(([key, entry]) => [
    key,
    trustedSingleLine(entry, `${field} ${key}`, 1, maximums[key]),
  ]))
}

function normalizeStoreProfile(value) {
  const profile = operationInput(value, MERCHANT_STORE_PROFILE_FIELDS)
  if (Object.keys(profile).length === 0) {
    domainFail('invalid-argument', 'Store profile update is empty.')
  }
  const normalized = {}
  for (const [field, raw] of Object.entries(profile)) {
    if (field === 'name') normalized.name = trustedSingleLine(raw, 'Store name', 3, 120)
    else if (field === 'description') {
      normalized.description = trustedMultiline(raw, 'Store description', 20, 5000)
    }
    else if (field === 'logoUrl' || field === 'bannerUrl') {
      normalized[field] = trustedSingleLine(
        raw,
        field === 'logoUrl' ? 'Store logo URL' : 'Store banner URL',
        1,
        2048,
      )
    } else if (field === 'socialLinks') {
      normalized.socialLinks = trustedProfileObject(
        raw,
        'Store social link',
        ['facebook', 'instagram', 'twitter', 'website'],
        { facebook: 2048, instagram: 2048, twitter: 2048, website: 2048 },
      )
    } else if (field === 'seo') {
      normalized.seo = trustedProfileObject(
        raw,
        'Store SEO',
        ['title', 'description'],
        { title: 120, description: 500 },
      )
    } else if (field === 'businessHours') {
      normalized.businessHours = trustedString(raw, 'Business hours', 1, 2000)
    } else if (field === 'shippingPolicy') {
      normalized.shippingPolicy = trustedMultiline(raw, 'Shipping policy', 1, 5000)
    } else if (field === 'shippingEnabled') {
      if (typeof raw !== 'boolean') domainFail('invalid-argument', 'Shipping setting is invalid.')
      normalized.shippingEnabled = raw
    } else if (field === 'shippingFee' || field === 'freeShippingThreshold') {
      normalized[field] = trustedFiniteNumber(
        raw,
        field === 'shippingFee' ? 'Shipping fee' : 'Free-shipping threshold',
        0,
        1_000_000_000,
      )
    } else if (field === 'estimatedDeliveryDays') {
      normalized.estimatedDeliveryDays = trustedSingleLine(raw, 'Estimated delivery time', 1, 200)
    }
  }
  return normalized
}

function validOptionalString(value, maximum, { multiline = false } = {}) {
  return value === undefined || (
    typeof value === 'string' && value.length <= maximum &&
    !(multiline ? containsUnsafeMultilineControl(value) : containsControlCharacter(value))
  )
}

function validStringMap(value, keys, maximums) {
  if (value === undefined) return true
  if (!isObject(value) || Object.keys(value).some((key) => !keys.includes(key))) return false
  return Object.entries(value).every(([key, entry]) =>
    typeof entry === 'string' && entry.length > 0 && entry.length <= maximums[key] &&
    !containsControlCharacter(entry))
}

function approvedPublicStoreProjection(store) {
  const projection = publicStoreProjection({ ...store, updatedAt: undefined })
  const required = [
    'ownerId', 'name', 'slug', 'description', 'status', 'verified', 'rating',
    'ratingCount', 'productCount', 'totalSales', 'createdAt',
  ]
  const compatible = required.every((field) => Object.hasOwn(projection, field)) &&
    validFirestoreDocumentId(projection.ownerId) &&
    typeof projection.name === 'string' && projection.name.trim().length > 0 &&
    projection.name.length <= 120 &&
    typeof projection.slug === 'string' && projection.slug.length > 0 && projection.slug.length <= 256 &&
    !containsControlCharacter(projection.slug) &&
    typeof projection.description === 'string' && projection.description.trim().length > 0 &&
    projection.description.length <= 5000 && !containsUnsafeMultilineControl(projection.description) &&
    projection.status === 'approved' &&
    typeof projection.verified === 'boolean' &&
    typeof projection.rating === 'number' && Number.isFinite(projection.rating) && projection.rating >= 0 &&
    Number.isSafeInteger(projection.ratingCount) && projection.ratingCount >= 0 &&
    Number.isSafeInteger(projection.productCount) && projection.productCount >= 0 &&
    typeof projection.totalSales === 'number' && Number.isFinite(projection.totalSales) &&
    projection.totalSales >= 0 &&
    Number.isSafeInteger(projection.createdAt) && projection.createdAt >= 0 &&
    validOptionalString(projection.logoUrl, 2048) &&
    validOptionalString(projection.bannerUrl, 2048) &&
    validOptionalString(projection.businessHours, 2000) &&
    validOptionalString(projection.shippingPolicy, 5000, { multiline: true }) &&
    validOptionalString(projection.estimatedDeliveryDays, 200) &&
    (projection.shippingEnabled === undefined || typeof projection.shippingEnabled === 'boolean') &&
    (projection.shippingFee === undefined || (
      typeof projection.shippingFee === 'number' && Number.isFinite(projection.shippingFee) &&
      projection.shippingFee >= 0
    )) &&
    (projection.freeShippingThreshold === undefined || (
      typeof projection.freeShippingThreshold === 'number' &&
      Number.isFinite(projection.freeShippingThreshold) && projection.freeShippingThreshold >= 0
    )) &&
    validStringMap(
      projection.socialLinks,
      ['facebook', 'instagram', 'twitter', 'website'],
      { facebook: 2048, instagram: 2048, twitter: 2048, website: 2048 },
    ) &&
    validStringMap(
      projection.seo,
      ['title', 'description'],
      { title: 120, description: 500 },
    )
  if (!compatible) {
    domainFail('failed-precondition', 'Store profile data is incompatible with public projection.')
  }
  return projection
}

function trustedEmail(value) {
  const clean = trustedSingleLine(value, 'Email', 3, 320)
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(clean)) domainFail('invalid-argument', 'Email is invalid.')
  return clean
}

function trustedPhone(value, field) {
  const clean = trustedSingleLine(value, field, 6, 40)
  if (!/^[+0-9().\-\s]+$/u.test(clean)) domainFail('invalid-argument', `${field} is invalid.`)
  return clean
}

function normalizeCheckoutLines(rawItems) {
  if (!Array.isArray(rawItems) || rawItems.length < 1 || rawItems.length > MAX_ITEMS) {
    domainFail('invalid-argument', 'Your cart must contain between 1 and 50 items.')
  }
  return rawItems.map((item) => {
    if (!isObject(item)) domainFail('invalid-argument', 'A cart item is invalid.')
    const productId = trustedIdentifier(item.productId, 'Product')
    const variantId = item.variantId === undefined || item.variantId === null || item.variantId === ''
      ? undefined
      : trustedIdentifier(item.variantId, 'Variant')
    if (!Number.isSafeInteger(item.quantity) || item.quantity <= 0 || item.quantity > MAX_ITEM_QUANTITY) {
      domainFail('invalid-argument', `Each item quantity must be an integer between 1 and ${MAX_ITEM_QUANTITY}.`)
    }
    return { productId, variantId, quantity: item.quantity }
  })
}

function assertPayloadBytes(raw, invalidMessage, tooLargeMessage) {
  let serialized
  try {
    serialized = JSON.stringify(raw)
  } catch {
    domainFail('invalid-argument', invalidMessage)
  }
  if (!serialized || new TextEncoder().encode(serialized).byteLength > MAX_CHECKOUT_PAYLOAD_BYTES) {
    domainFail('invalid-argument', tooLargeMessage)
  }
}

function normalizeCheckoutIntent(raw) {
  assertPayloadBytes(raw, 'Checkout request is invalid.', 'Checkout request is too large.')
  if (!isObject(raw)) domainFail('invalid-argument', 'Checkout request is invalid.')
  const items = normalizeCheckoutLines(raw.items)
  if (!isObject(raw.delivery) || !isObject(raw.delivery.address)) {
    domainFail('invalid-argument', 'Delivery details are invalid.')
  }
  const address = raw.delivery.address
  const line2 = trustedOptionalString(address.line2, 'Address line 2', 1, 200, { singleLine: true })
  const delivery = {
    fullName: trustedSingleLine(raw.delivery.fullName, 'Full name', 2, 100),
    email: trustedEmail(raw.delivery.email),
    phone: trustedPhone(raw.delivery.phone, 'Phone'),
    address: {
      fullName: trustedSingleLine(address.fullName, 'Address name', 2, 100),
      phone: trustedPhone(address.phone, 'Address phone'),
      line1: trustedSingleLine(address.line1, 'Address line 1', 3, 200),
      ...(line2 ? { line2 } : {}),
      city: trustedSingleLine(address.city, 'City', 2, 100),
      province: trustedSingleLine(address.province, 'Province', 2, 100),
      postalCode: trustedSingleLine(address.postalCode, 'Postal code', 2, 32),
      country: trustedSingleLine(address.country, 'Country', 2, 100),
    },
  }
  if (raw.paymentMethod !== 'cod') {
    domainFail('invalid-argument', 'Only Cash on Delivery is currently supported.')
  }
  return {
    items,
    delivery,
    paymentMethod: 'cod',
    couponCode: trustedOptionalString(raw.couponCode, 'Promo code', 3, 50)?.toUpperCase(),
    specialInstructions: trustedOptionalString(raw.specialInstructions, 'Special instructions', 1, 2000),
    giftNote: trustedOptionalString(raw.giftNote, 'Gift note', 1, 1000),
    idempotencyKey: trustedIdentifier(raw.idempotencyKey, 'Checkout request ID', 8, 128),
  }
}

function normalizeCouponPreview(raw) {
  assertPayloadBytes(raw, 'Coupon preview request is invalid.', 'Coupon preview request is too large.')
  const input = operationInput(raw, ['actor', 'code', 'items'])
  return {
    actor: input.actor,
    code: trustedString(input.code, 'Promo code', 3, 50).toUpperCase(),
    items: normalizeCheckoutLines(input.items),
  }
}

export function normalizeNewsletterEmail(raw) {
  const input = operationInput(raw, ['email'])
  return trustedEmail(input.email).toLowerCase()
}

function canonicalHashInput(intent) {
  return JSON.stringify(intent)
}

function exactKeyedRecords(value, ids, missingMessage) {
  if (!(value instanceof Map) || value.size !== ids.length) {
    domainFail('internal', 'Trusted repository multi-read contract was violated.')
  }
  const expected = new Set(ids)
  for (const [id, record] of value) {
    if (!expected.has(id) || (record !== null && (!isObject(record) || record.id !== id))) {
      domainFail('internal', 'Trusted repository multi-read contract was violated.')
    }
  }
  for (const id of ids) {
    if (!value.has(id)) domainFail('internal', 'Trusted repository multi-read contract was violated.')
    if (value.get(id) === null) domainFail('failed-precondition', missingMessage)
  }
  return value
}

function trustedNow(now) {
  const value = now()
  if (!Number.isSafeInteger(value) || value < 0) domainFail('internal', 'Trusted clock is invalid.')
  return value
}

function trustedDigest(digest, value) {
  const result = digest(value)
  if (typeof result !== 'string' || !/^[a-f0-9]{64}$/u.test(result)) {
    domainFail('internal', 'Trusted digest provider is invalid.')
  }
  return result
}

function rememberCheckoutRequestId(value, requestId) {
  if ((typeof value === 'object' && value !== null) || typeof value === 'function') {
    checkoutRequestIds.set(value, requestId)
  }
  return value
}

async function correlateCheckoutRequest(operation, requestId) {
  try {
    return rememberCheckoutRequestId(await operation, requestId)
  } catch (error) {
    rememberCheckoutRequestId(error, requestId)
    throw error
  }
}

/** Trusted adapter-only correlation metadata; symbols/hashes are never added to the client result. */
export function trustedCheckoutRequestId(value) {
  return checkoutRequestIds.get(value)
}

function inventoryLog(transaction, { actorId, product, change, reason, note, variant }) {
  transaction.createInventoryLog({
    storeId: product.storeId,
    productId: product.id,
    productName: product.name,
    change,
    reason,
    ...(note ? { note } : {}),
    ...(variant ? { variantId: variant.id, variant: variant.options, sku: variant.sku ?? null } : {}),
    by: actorId,
  })
}

async function inventoryContext(transaction, actorId, productId) {
  const [user, product] = await Promise.all([
    transaction.getUser(actorId),
    transaction.getProduct(productId),
  ])
  if (!user || user.suspended === true) {
    domainFail('permission-denied', 'Active merchant access is required.')
  }
  if (!product) domainFail('not-found', 'Product was not found.')
  if (user.role === 'admin') return { user, product }
  if (user.role !== 'merchant' || product.merchantId !== actorId || !product.storeId) {
    domainFail('permission-denied', 'You cannot manage this product inventory.')
  }
  const store = await transaction.getStore(product.storeId)
  if (!store || store.ownerId !== actorId || store.status !== 'approved') {
    domainFail('permission-denied', 'You cannot manage this product inventory.')
  }
  return { user, product }
}

async function lifecycleContext(transaction, actorId, orderId) {
  const [user, order] = await Promise.all([
    transaction.getUser(actorId),
    transaction.getOrder(orderId),
  ])
  if (!user || user.suspended === true) {
    domainFail('permission-denied', 'An active account is required.')
  }
  if (!order) domainFail('not-found', 'Order not found.')
  return { user, order }
}

async function assertMerchantAuthority(transaction, actorId, { user, order }, { allowAdmin = false } = {}) {
  if (allowAdmin && user.role === 'admin') return
  if (user.role !== 'merchant') domainFail('permission-denied', 'Merchant access is required.')
  if (order.merchantId !== actorId || typeof order.storeId !== 'string') {
    domainFail('permission-denied', 'You cannot manage this order.')
  }
  const store = await transaction.getStore(order.storeId)
  if (!store || store.ownerId !== actorId || store.status !== 'approved') {
    domainFail('permission-denied', 'You cannot manage this order.')
  }
}

function orderActivity(transaction, { actorId, user, order, orderId, action, detail }) {
  transaction.createActivityLog({
    actorId,
    actorName: user.displayName ?? 'Vendora user',
    actorRole: user.role,
    action,
    targetType: 'order',
    targetId: orderId,
    detail: detail ?? order.orderNumber,
  })
}

function orderNotification(transaction, userId, orderId, title, body, linkPrefix = '/account/orders') {
  transaction.createNotification({
    userId,
    type: 'order_update',
    title,
    body,
    linkUrl: `${linkPrefix}/${orderId}`,
    read: false,
  })
}

function trustedAdminIds(value) {
  if (!Array.isArray(value) || new Set(value).size !== value.length ||
    value.some((id) => !validFirestoreDocumentId(id))) {
    domainFail('internal', 'Trusted administrator query was invalid.')
  }
  return value
}

async function userAdministrationContext(transaction, actorId, userId, adminIds) {
  const ids = [...new Set([...adminIds, actorId, userId])]
  const records = await Promise.all(ids.map((id) => transaction.getUser(id)))
  const byId = new Map(ids.map((id, index) => [id, records[index]]))
  const actorUser = byId.get(actorId)
  const target = byId.get(userId)
  if (!actorUser || actorUser.role !== 'admin' || actorUser.suspended === true) {
    domainFail('permission-denied', 'Active administrator access is required.')
  }
  if (!target) domainFail('not-found', 'User was not found.')
  if (!USER_PROFILE_ROLES.includes(target.role)) {
    domainFail('failed-precondition', 'User role state is invalid.')
  }
  return { actorUser, target, byId }
}

function activeAdminCount(adminIds, byId) {
  return adminIds.reduce(
    (count, id) => count + (byId.get(id)?.role === 'admin' && byId.get(id)?.suspended !== true ? 1 : 0),
    0,
  )
}

function userAdminActivity(transaction, actorId, actorUser, action, userId, detail) {
  transaction.createActivityLog({
    actorId,
    actorName: actorUser.displayName ?? 'Vendora administrator',
    actorRole: actorUser.role,
    action,
    targetType: 'user',
    targetId: userId,
    detail,
  })
}

function supportActorName(user, fallback) {
  return typeof user.displayName === 'string' && user.displayName.trim()
    ? user.displayName.trim().slice(0, 100)
    : fallback
}

function supportCustomerEmail(user) {
  return typeof user.email === 'string' && user.email.trim()
    ? user.email.trim().slice(0, 320)
    : ''
}

function activeSupportAdmins(users) {
  if (!Array.isArray(users)) domainFail('internal', 'Trusted administrator query was invalid.')
  const ids = new Set()
  const active = []
  for (const user of users) {
    if (!isObject(user) || !validFirestoreDocumentId(user.id) || user.role !== 'admin' || ids.has(user.id)) {
      domainFail('internal', 'Trusted administrator query was invalid.')
    }
    ids.add(user.id)
    if (user.suspended !== true) active.push(user)
  }
  return active
}

function supportNotification(transaction, userId, title, body, linkUrl) {
  transaction.createNotification({
    userId,
    type: 'support',
    title,
    body,
    linkUrl,
    read: false,
  })
}

function assertSupportTicket(ticket) {
  if (
    !isObject(ticket) || !validFirestoreDocumentId(ticket.id) ||
    !validFirestoreDocumentId(ticket.customerId) ||
    typeof ticket.subject !== 'string' || !ticket.subject.trim() ||
    !SUPPORT_STATUSES.includes(ticket.status) || !Array.isArray(ticket.messages)
  ) {
    domainFail('failed-precondition', 'Support ticket data is invalid.')
  }
}

function assertDependencies(options) {
  assertTrustedRepository(options.repository)
  if (typeof options.createOrderNumber !== 'function') {
    domainFail('internal', 'Trusted order number provider is unavailable.')
  }
  if (typeof options.now !== 'function') domainFail('internal', 'Trusted clock is unavailable.')
  if (typeof options.digest !== 'function') domainFail('internal', 'Trusted digest provider is unavailable.')
}

function nextSupportNotificationRevision(ticket) {
  const current = ticket?.[TRUSTED_SUPPORT_NOTIFICATION_REVISION_FIELD]

  if (current === undefined) return 1

  if (
    !Number.isSafeInteger(current) ||
    current < 0 ||
    current >= Number.MAX_SAFE_INTEGER
  ) {
    domainFail(
      'failed-precondition',
      'Support ticket notification revision is invalid.',
    )
  }

  return current + 1
}
export function createTrustedCommerceOperations({
  repository,
  createOrderNumber,
  digest,
  now = Date.now,
  idempotencyRetentionMs = IDEMPOTENCY_RETENTION_MS,
}) {
  const dependencies = { repository, createOrderNumber, digest, now }
  assertDependencies(dependencies)

  const transact = (operation) => repository.runTransaction(async (transaction) => {
    assertTransactionPort(transaction)
    return operation(transaction)
  })

  return Object.freeze({
    async createSupportTicket(raw) {
      const input = operationInput(raw, ['actor', 'subject', 'orderId', 'priority', 'message'])
      const actorId = verifiedPrincipalId(input.actor)
      const subject = trustedSingleLine(input.subject, 'Subject', 1, 120)
      const orderId = trustedOptionalString(input.orderId, 'Order ID', 1, 128, { singleLine: true })
      if (orderId && (orderId.includes('/') || containsControlCharacter(orderId))) {
        domainFail('invalid-argument', 'Order ID is invalid.')
      }
      if (!SUPPORT_PRIORITIES.includes(input.priority)) {
        domainFail('invalid-argument', 'Support priority is invalid.')
      }
      const messageText = trustedMultiline(input.message, 'Message', 1, 5000)
      return transact(async (transaction) => {
        const [user, adminUsers] = await Promise.all([
          transaction.getUser(actorId),
          transaction.getAdminUsers(),
        ])
        if (!user || user.role !== 'customer' || user.suspended === true) {
          domainFail('permission-denied', 'Active customer access is required.')
        }
        const customerName = supportActorName(user, 'Customer')
        const ticketId = transaction.newSupportTicketId()
        transaction.createSupportTicket(ticketId, {
          customerId: actorId,
          customerName,
          customerEmail: supportCustomerEmail(user),
          ...(orderId ? { orderId } : {}),
          subject,
          status: 'open',
          priority: input.priority,
          [TRUSTED_SUPPORT_NOTIFICATION_REVISION_FIELD]: 1,
          messages: [{
            senderId: actorId,
            senderName: customerName,
            text: messageText,
            at: trustedNow(now),
          }],
        })
        for (const admin of activeSupportAdmins(adminUsers)) {
          supportNotification(
            transaction,
            admin.id,
            'New support ticket',
            `${customerName} opened "${subject}".`,
            '/admin/support',
          )
        }
        return { ticketId }
      })
    },

    async replySupportTicket(raw) {
      const input = operationInput(raw, ['actor', 'ticketId', 'text'])
      const actorId = verifiedPrincipalId(input.actor)
      const ticketId = trustedIdentifier(input.ticketId, 'Support ticket')
      const text = trustedMultiline(input.text, 'Reply', 1, 5000)
      return transact(async (transaction) => {
        const [user, ticket] = await Promise.all([
          transaction.getUser(actorId),
          transaction.getSupportTicket(ticketId),
        ])
        if (!user || user.suspended === true || !['customer', 'admin'].includes(user.role)) {
          domainFail('permission-denied', 'Active customer or administrator access is required.')
        }
        if (!ticket) domainFail('not-found', 'Support ticket not found.')
        assertSupportTicket(ticket)
        const isAdmin = user.role === 'admin'
        if (!isAdmin && ticket.customerId !== actorId) {
          domainFail('permission-denied', 'You cannot reply to this support ticket.')
        }
        if (!isAdmin && ticket.status === 'closed') {
          domainFail('failed-precondition', 'This support ticket is closed.')
        }
        const senderName = supportActorName(user, isAdmin ? 'Vendora administrator' : 'Customer')
        let admins = []
        if (!isAdmin) admins = activeSupportAdmins(await transaction.getAdminUsers())
        transaction.appendSupportTicketMessage(ticketId, {
          senderId: actorId,
          senderName,
          text,
          at: trustedNow(now),
        }, nextSupportNotificationRevision(ticket))
        if (isAdmin) {
          supportNotification(
            transaction,
            ticket.customerId,
            'Support team replied',
            `You have a new reply on "${ticket.subject}".`,
            '/account/support',
          )
        } else {
          const customerName = supportActorName(user, 'Customer')
          for (const admin of admins) {
            supportNotification(
              transaction,
              admin.id,
              'New support reply',
              `${customerName} replied to "${ticket.subject}".`,
              '/admin/support',
            )
          }
        }
        return { ticketId, replied: true }
      })
    },

    async setSupportTicketStatus(raw) {
      const input = operationInput(raw, ['actor', 'ticketId', 'status'])
      const actorId = verifiedPrincipalId(input.actor)
      const ticketId = trustedIdentifier(input.ticketId, 'Support ticket')
      if (!SUPPORT_STATUSES.includes(input.status)) {
        domainFail('invalid-argument', 'Support status is invalid.')
      }
      return transact(async (transaction) => {
        const [user, ticket] = await Promise.all([
          transaction.getUser(actorId),
          transaction.getSupportTicket(ticketId),
        ])
        if (!user || user.role !== 'admin' || user.suspended === true) {
          domainFail('permission-denied', 'Active administrator access is required.')
        }
        if (!ticket) domainFail('not-found', 'Support ticket not found.')
        assertSupportTicket(ticket)
        if (ticket.status === input.status) {
          return { ticketId, status: input.status, changed: false }
        }
        transaction.updateSupportTicketStatus(ticketId, input.status, nextSupportNotificationRevision(ticket))
        supportNotification(
          transaction,
          ticket.customerId,
          'Support ticket updated',
          `"${ticket.subject}" is now ${input.status.replace(/_/gu, ' ')}.`,
          '/account/support',
        )
        return { ticketId, status: input.status, changed: true }
      })
    },

    async updateStoreProfile(raw) {
      const input = operationInput(raw, ['actor', 'storeId', 'profile'])
      const actorId = verifiedPrincipalId(input.actor)
      const storeId = trustedIdentifier(input.storeId, 'Store')
      const profile = normalizeStoreProfile(input.profile)
      return transact(async (transaction) => {
        const [user, store] = await Promise.all([
          transaction.getUser(actorId),
          transaction.getStore(storeId),
        ])
        if (!user || user.role !== 'merchant' || user.suspended === true || user.storeId !== storeId) {
          domainFail('permission-denied', 'Active store owner access is required.')
        }
        if (!store || store.ownerId !== actorId) {
          domainFail('permission-denied', 'Active store owner access is required.')
        }
        if (store.status !== 'approved') {
          domainFail('failed-precondition', 'Only an approved store profile can be updated.')
        }
        const projection = approvedPublicStoreProjection({ ...store, ...profile })
        transaction.updateStoreProfile(storeId, profile)
        transaction.setPublicStore(storeId, projection)
        // Store/product visibility depends only on moderation statuses. This
        // capability cannot alter either status, so no product reconciliation
        // is necessary or permitted here.
        return { storeId, updated: true }
      })
    },

    async setStoreVerified(raw) {
      const input = operationInput(raw, ['actor', 'storeId', 'verified'])
      const actorId = verifiedPrincipalId(input.actor)
      const storeId = trustedIdentifier(input.storeId, 'Store')
      if (typeof input.verified !== 'boolean') {
        domainFail('invalid-argument', 'Store verification state is invalid.')
      }
      return transact(async (transaction) => {
        const [user, store] = await Promise.all([
          transaction.getUser(actorId),
          transaction.getStore(storeId),
        ])
        if (!user || user.role !== 'admin' || user.suspended === true) {
          domainFail('permission-denied', 'Active administrator access is required.')
        }
        if (!store) domainFail('not-found', 'Store was not found.')
        if (store.status !== 'approved') {
          domainFail('failed-precondition', 'Only an approved store can be verified.')
        }
        const projection = approvedPublicStoreProjection({ ...store, verified: input.verified })
        transaction.updateStoreVerified(storeId, input.verified)
        transaction.setPublicStore(storeId, projection)
        return { storeId, verified: input.verified }
      })
    },

    async changeUserRole(raw) {
      const input = operationInput(raw, ['actor', 'userId', 'role'])
      const actorId = verifiedPrincipalId(input.actor)
      const userId = trustedIdentifier(input.userId, 'User')
      if (typeof input.role !== 'string' || !USER_PROFILE_ROLES.includes(input.role)) {
        domainFail('invalid-argument', 'User role is invalid.')
      }
      const adminIds = trustedAdminIds(await repository.getAdminUserIds())
      return transact(async (transaction) => {
        const { actorUser, target, byId } = await userAdministrationContext(
          transaction, actorId, userId, adminIds,
        )
        if (actorId === userId) {
          domainFail('failed-precondition', 'Administrators cannot change their own role.')
        }
        if (input.role === 'merchant') {
          domainFail('failed-precondition', 'Merchant access is granted through store approval.')
        }
        if (target.role === 'merchant' || target.storeId !== undefined) {
          domainFail(
            'failed-precondition',
            'Merchant role and store linkage are managed through the store lifecycle.',
          )
        }
        if (target.role === input.role) return { userId, role: input.role }
        if (target.role === 'admin' && target.suspended !== true && input.role === 'customer' &&
          activeAdminCount(adminIds, byId) <= 1) {
          domainFail('failed-precondition', 'The last active administrator cannot be demoted.')
        }
        transaction.updateUserRole(userId, input.role)
        userAdminActivity(
          transaction, actorId, actorUser, 'user.role_changed', userId,
          `${target.role} -> ${input.role}`,
        )
        return { userId, role: input.role }
      })
    },

    async setUserSuspended(raw) {
      const input = operationInput(raw, ['actor', 'userId', 'suspended'])
      const actorId = verifiedPrincipalId(input.actor)
      const userId = trustedIdentifier(input.userId, 'User')
      if (typeof input.suspended !== 'boolean') {
        domainFail('invalid-argument', 'User suspension is invalid.')
      }
      const prerequisites = await repository.getUserAdministrationPrerequisites(actorId, userId)
      if (!isObject(prerequisites) || !Object.hasOwn(prerequisites, 'actor') ||
        !Object.hasOwn(prerequisites, 'target') || !Object.hasOwn(prerequisites, 'store')) {
        domainFail('internal', 'Trusted user administration preflight was invalid.')
      }
      if (!prerequisites.actor || prerequisites.actor.role !== 'admin' ||
        prerequisites.actor.suspended === true) {
        domainFail('permission-denied', 'Active administrator access is required.')
      }
      if (!prerequisites.target) domainFail('not-found', 'User was not found.')
      if (actorId === userId) {
        domainFail('failed-precondition', 'Administrators cannot change their own suspension.')
      }
      const merchantTarget = prerequisites.target.role === 'merchant'
      let merchantStoreId
      if (merchantTarget) {
        if (!validFirestoreDocumentId(prerequisites.target.storeId) || !prerequisites.store ||
          prerequisites.store.ownerId !== userId) {
          domainFail('failed-precondition', 'Merchant store linkage is invalid.')
        }
        merchantStoreId = prerequisites.target.storeId
      }
      if (merchantTarget && input.suspended) {
        await repository.reconcileStoreProductVisibility(merchantStoreId, false)
      }
      const adminIds = trustedAdminIds(await repository.getAdminUserIds())
      const result = await transact(async (transaction) => {
        const { actorUser, target, byId } = await userAdministrationContext(
          transaction, actorId, userId, adminIds,
        )
        if (actorId === userId) {
          domainFail('failed-precondition', 'Administrators cannot change their own suspension.')
        }
        if (input.suspended) {
          const transactionMerchant = target.role === 'merchant'
          if (
            transactionMerchant !== merchantTarget ||
            (merchantTarget && target.storeId !== merchantStoreId)
          ) {
            domainFail(
              'failed-precondition',
              'User account state changed during suspension. Retry the operation.',
            )
          }
        }
        if (target.role === 'admin' && target.suspended !== true && input.suspended &&
          activeAdminCount(adminIds, byId) <= 1) {
          domainFail('failed-precondition', 'The last active administrator cannot be suspended.')
        }

        let store = null
        let application = null
        if (target.role === 'merchant') {
          if (!validFirestoreDocumentId(target.storeId)) {
            domainFail('failed-precondition', 'Merchant store linkage is invalid.')
          }
          ;[store, application] = await Promise.all([
            transaction.getStore(target.storeId),
            transaction.getMerchantApplication(target.storeId),
          ])
          if (!store || store.ownerId !== userId) {
            domainFail('failed-precondition', 'Merchant store linkage is invalid.')
          }
        }

        const suspendApprovedStore = input.suspended && target.role === 'merchant' &&
          store.status === 'approved'
        if (suspendApprovedStore && !application) {
          domainFail('failed-precondition', 'Store application migration is incomplete.')
        }
        if (target.suspended === input.suspended && !suspendApprovedStore) {
          return { output: { userId, suspended: input.suspended }, reconcileStoreId: null }
        }
        transaction.updateUserSuspended(userId, input.suspended)
        if (suspendApprovedStore) {
          if (typeof store.name !== 'string' || !store.name.trim()) {
            domainFail('failed-precondition', 'Store identity is invalid.')
          }
          transaction.updateStoreStatus(target.storeId, 'suspended')
          transaction.updateMerchantApplicationStatus(target.storeId, 'suspended', '')
          transaction.deletePublicStore(target.storeId)
          transaction.createNotification({
            userId,
            type: 'approval',
            title: 'Store suspended',
            body: `Your store "${store.name}" was suspended.`,
            linkUrl: '/merchant',
            read: false,
          })
        }
        userAdminActivity(
          transaction,
          actorId,
          actorUser,
          input.suspended ? 'user.suspended' : 'user.unsuspended',
          userId,
          input.suspended ? 'Account suspended' : 'Account unsuspended',
        )
        return {
          output: { userId, suspended: input.suspended },
          reconcileStoreId: suspendApprovedStore ? target.storeId : null,
        }
      })
      if (input.suspended && (merchantTarget || result.reconcileStoreId)) {
        await repository.reconcileStoreProductVisibility(result.reconcileStoreId ?? merchantStoreId, false)
      }
      return result.output
    },

    async moderateStore(raw) {
      const input = operationInput(raw, ['actor', 'storeId', 'status', 'reason'])
      const actorId = verifiedPrincipalId(input.actor)
      const storeId = trustedIdentifier(input.storeId, 'Store')
      if (!STORE_MODERATION_STATUSES.includes(input.status)) {
        domainFail('invalid-argument', 'Store status is invalid.')
      }
      const reason = trustedOptionalString(input.reason, 'Reason', 1, 2000)

      const prerequisites = await repository.getStoreModerationPrerequisites(actorId, storeId)
      if (!isObject(prerequisites) || !Object.hasOwn(prerequisites, 'user') ||
        !Object.hasOwn(prerequisites, 'store')) {
        domainFail('internal', 'Trusted store moderation preflight was invalid.')
      }
      if (!prerequisites.user || prerequisites.user.role !== 'admin' ||
        prerequisites.user.suspended === true) {
        domainFail('permission-denied', 'Active administrator access is required.')
      }
      if (!prerequisites.store) domainFail('not-found', 'Store was not found.')

      // Restrictive transitions fail safe: hide before the status change, then
      // reconcile again after commit to close concurrent product-write races.
      if (input.status !== 'approved') {
        await repository.reconcileStoreProductVisibility(storeId, false)
      }

      const result = await transact(async (transaction) => {
        const [user, store, application] = await Promise.all([
          transaction.getUser(actorId),
          transaction.getStore(storeId),
          transaction.getMerchantApplication(storeId),
        ])
        if (!user || user.role !== 'admin' || user.suspended === true) {
          domainFail('permission-denied', 'Active administrator access is required.')
        }
        if (!store || !application) {
          domainFail('failed-precondition', 'Store application migration is incomplete.')
        }
        if (!validFirestoreDocumentId(store.ownerId)) {
          domainFail('failed-precondition', 'Store owner identity is invalid.')
        }
        if (application.storeId !== storeId || application.ownerId !== store.ownerId) {
          domainFail('failed-precondition', 'Store application ownership is invalid.')
        }
        if (typeof store.name !== 'string' || !store.name.trim()) {
          domainFail('failed-precondition', 'Store identity is invalid.')
        }
        if (input.status === 'approved') {
          const owner = await transaction.getUser(store.ownerId)
          if (!owner || owner.suspended === true) {
            domainFail(
              'failed-precondition',
              'Store owner account must be active before approval.',
            )
          }
        }

        transaction.updateStoreStatus(storeId, input.status)
        transaction.updateMerchantApplicationStatus(storeId, input.status, reason ?? '')
        if (input.status === 'approved') {
          transaction.setPublicStore(storeId, publicStoreProjection({
            ...store,
            status: input.status,
            updatedAt: undefined,
          }))
          transaction.promoteStoreOwnerToMerchant(store.ownerId, storeId)
        } else {
          transaction.deletePublicStore(storeId)
        }
        transaction.createNotification({
          userId: store.ownerId,
          type: 'approval',
          title: `Store ${input.status}`,
          body: input.status === 'approved'
            ? `Congratulations! "${store.name}" is now live. You can start listing products.`
            : `Your store "${store.name}" was ${input.status}.${reason ? ` Reason: ${reason}` : ''}`,
          linkUrl: '/merchant',
          read: false,
        })
        return { storeId, status: input.status }
      })

      await repository.reconcileStoreProductVisibility(storeId, input.status === 'approved')
      return result
    },

    async moderateProduct(raw) {
      const input = operationInput(raw, ['actor', 'productId', 'status', 'reason'])
      const actorId = verifiedPrincipalId(input.actor)
      const productId = trustedIdentifier(input.productId, 'Product')
      if (!PRODUCT_MODERATION_STATUSES.includes(input.status)) {
        domainFail('invalid-argument', 'Product status is invalid.')
      }
      const reason = trustedOptionalString(input.reason, 'Reason', 1, 2000)

      return transact(async (transaction) => {
        const [user, product] = await Promise.all([
          transaction.getUser(actorId),
          transaction.getProduct(productId),
        ])
        if (!user || user.role !== 'admin' || user.suspended === true) {
          domainFail('permission-denied', 'Active administrator access is required.')
        }
        if (!product) domainFail('not-found', 'Product was not found.')
        if (typeof product.merchantId !== 'string' || !product.merchantId) {
          domainFail('failed-precondition', 'Product merchant ownership is invalid.')
        }
        if (!validFirestoreDocumentId(product.storeId)) {
          domainFail('failed-precondition', 'Product store ownership is invalid.')
        }
        const store = await transaction.getStore(product.storeId)
        if (!store) domainFail('failed-precondition', 'Product store was not found.')
        if (input.status === 'approved') {
          authoritativeProductInventory(
            product,
            'Product inventory is invalid. Correct its stock and variants before approval.',
          )
        }
        const publiclyVisible = input.status === 'approved' && store.status === 'approved'

        transaction.updateProduct(
          productId,
          {
            status: input.status,
            rejectionReason: reason ?? '',
            publiclyVisible,
          },
          input.status === 'approved' ? ['publishedAt'] : [],
        )
        transaction.createNotification({
          userId: product.merchantId,
          type: 'approval',
          title: `Product ${input.status}`,
          body: `"${product.name}" was ${input.status}.${reason ? ` Reason: ${reason}` : ''}`,
          linkUrl: '/merchant/products',
          read: false,
        })
        return { productId, status: input.status, publiclyVisible }
      })
    },

    async setProductInventory(raw) {
      const { actor, productId: rawProductId, stock, variantStocks } = operationInput(
        raw,
        ['actor', 'productId', 'stock', 'variantStocks'],
      )
      const actorId = verifiedPrincipalId(actor)
      const productId = trustedIdentifier(rawProductId, 'Product')
      return transact(async (transaction) => {
        const context = await inventoryContext(transaction, actorId, productId)
        const inventory = authoritativeProductInventory(
          context.product,
          'Product inventory must be repaired before it can be updated.',
        )
        let nextStock
        let nextVariants
        if (inventory.hasVariants) {
          if (!Array.isArray(variantStocks) || variantStocks.length !== inventory.variants.length) {
            domainFail('invalid-argument', 'Every product variant needs an inventory value.')
          }
          const requested = new Map()
          for (const entry of variantStocks) {
            if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
              domainFail('invalid-argument', 'Variant inventory is invalid.')
            }
            const variantId = trustedIdentifier(entry.variantId, 'Variant')
            if (
              typeof variantId !== 'string' ||
              requested.has(variantId) ||
              !inventory.byId.has(variantId) ||
              !Number.isSafeInteger(entry.stock) ||
              entry.stock < 0
            ) {
              domainFail('invalid-argument', 'Variant inventory is invalid.')
            }
            requested.set(variantId, entry.stock)
          }
          nextVariants = inventory.variants.map((variant) => ({
            ...variant,
            stock: requested.get(variant.id),
          }))
          nextStock = 0
          for (const variant of nextVariants) {
            nextStock += variant.stock
            if (!Number.isSafeInteger(nextStock)) {
              domainFail('invalid-argument', 'Variant inventory is invalid.')
            }
          }
        } else {
          if (!Number.isSafeInteger(stock) || stock < 0) {
            domainFail('invalid-argument', 'Stock must be a non-negative integer.')
          }
          if (variantStocks !== undefined) {
            domainFail('invalid-argument', 'This product does not have variants.')
          }
          nextStock = stock
        }

        transaction.updateProduct(productId, {
          stock: nextStock,
          ...(nextVariants ? { variants: nextVariants } : {}),
        })
        const change = nextStock - inventory.stock
        if (change !== 0) {
          inventoryLog(transaction, {
            actorId,
            product: context.product,
            change,
            reason: 'adjustment',
            note: 'Inventory updated from the product form.',
          })
        }
        return { productId, stock: nextStock, variants: nextVariants ?? null }
      })
    },

    async adjustProductStock(raw) {
      const input = operationInput(
        raw,
        ['actor', 'productId', 'variantId', 'change', 'reason', 'note'],
      )
      const actorId = verifiedPrincipalId(input.actor)
      const productId = trustedIdentifier(input.productId, 'Product')
      const variantId = input.variantId === undefined || input.variantId === null || input.variantId === ''
        ? undefined
        : trustedIdentifier(input.variantId, 'Variant')
      const { change, reason } = input
      if (!Number.isSafeInteger(change) || change === 0 || Math.abs(change) > 1_000_000) {
        domainFail('invalid-argument', 'Inventory adjustment is invalid.')
      }
      if (!INVENTORY_REASONS.includes(reason)) {
        domainFail('invalid-argument', 'Inventory adjustment reason is invalid.')
      }
      const note = trustedOptionalString(input.note, 'Inventory note', 1, 1000)
      return transact(async (transaction) => {
        const context = await inventoryContext(transaction, actorId, productId)
        const inventory = authoritativeProductInventory(
          context.product,
          'Product inventory must be repaired before it can be adjusted.',
        )
        let nextStock
        let nextVariants
        let selectedVariant
        if (inventory.hasVariants) {
          if (!variantId) domainFail('invalid-argument', 'Choose a product variant to adjust.')
          selectedVariant = inventory.byId.get(variantId)
          if (!selectedVariant) domainFail('failed-precondition', 'The selected variant is unavailable.')
          const selectedStock = selectedVariant.stock + change
          if (!Number.isSafeInteger(selectedStock) || selectedStock < 0) {
            domainFail('failed-precondition', 'Stock cannot go below zero.')
          }
          nextVariants = inventory.variants.map((variant) =>
            variant.id === variantId ? { ...variant, stock: selectedStock } : variant,
          )
          nextStock = inventory.stock + change
          if (!Number.isSafeInteger(nextStock) || nextStock < 0) {
            domainFail('failed-precondition', 'Stock cannot go below zero.')
          }
        } else {
          if (variantId) domainFail('invalid-argument', 'This product does not have variants.')
          nextStock = inventory.stock + change
          if (!Number.isSafeInteger(nextStock) || nextStock < 0) {
            domainFail('failed-precondition', 'Stock cannot go below zero.')
          }
        }
        transaction.updateProduct(productId, {
          stock: nextStock,
          ...(nextVariants ? { variants: nextVariants } : {}),
        })
        inventoryLog(transaction, {
          actorId,
          product: context.product,
          change,
          reason,
          note,
          variant: selectedVariant,
        })
        return { productId, variantId: variantId ?? null, stock: nextStock }
      })
    },

    async previewCoupon(raw) {
      const input = normalizeCouponPreview(raw)
      const customerId = verifiedPrincipalId(input.actor)
      return transact(async (transaction) => {
        const user = await transaction.getUser(customerId)
        if (!user || user.role !== 'customer' || user.suspended === true) {
          domainFail('permission-denied', 'This account cannot apply promo codes.')
        }

        const currentTime = trustedNow(now)
        const productIds = [...new Set(input.items.map((item) => item.productId))]
        const products = exactKeyedRecords(
          await transaction.getProducts(productIds),
          productIds,
          PRODUCT_UNAVAILABLE,
        )
        const authoritativeItems = input.items.map((item) => {
          const product = products.get(item.productId)
          if (!product || product.status !== 'approved' || product.publiclyVisible !== true) {
            domainFail('failed-precondition', PRODUCT_UNAVAILABLE)
          }
          const inventory = authoritativeProductInventory(product, PRODUCT_UNAVAILABLE)
          if (inventory.hasVariants && !item.variantId) domainFail('failed-precondition', PRODUCT_UNAVAILABLE)
          if (!inventory.hasVariants && item.variantId) domainFail('failed-precondition', PRODUCT_UNAVAILABLE)
          if (item.variantId && !inventory.byId.has(item.variantId)) {
            domainFail('failed-precondition', PRODUCT_UNAVAILABLE)
          }
          const { price } = currentProductPrice(
            product,
            item.variantId,
            currentTime,
            PRODUCT_UNAVAILABLE,
          )
          return {
            productId: item.productId,
            storeId: product.storeId,
            price,
            quantity: item.quantity,
          }
        })
        const storeIds = [...new Set(authoritativeItems.map((item) => item.storeId))]
        if (storeIds.some((id) => !validFirestoreDocumentId(id))) {
          domainFail('failed-precondition', PRODUCT_UNAVAILABLE)
        }
        const stores = exactKeyedRecords(
          await transaction.getStores(storeIds),
          storeIds,
          'One or more stores are unavailable.',
        )
        if (storeIds.some((storeId) => stores.get(storeId).status !== 'approved')) {
          domainFail('failed-precondition', 'One or more stores are unavailable.')
        }

        const matches = await transaction.findCouponsByCode(input.code)
        // Store coupons are intentionally preferred over a platform coupon
        // with the same code, matching the established storefront behavior.
        const coupon = storeIds
          .map((storeId) => matches.find((candidate) => candidate.storeId === storeId))
          .find(Boolean) ?? matches.find((candidate) => !candidate.storeId)
        if (!coupon) {
          return { valid: false, discount: 0, message: 'This promo code is not valid.' }
        }

        try {
          const customerUsage = await transaction.getCustomerCouponUsage(coupon.id, customerId)
          const customerUsageCount = customerUsage ? Number(customerUsage.count) : 0
          if (!Number.isSafeInteger(customerUsageCount) || customerUsageCount < 0) {
            domainFail('failed-precondition', 'This promo code is not valid.')
          }
          let hasQualifyingPriorOrder = false
          if (coupon.type === 'first_order') {
            const customerOrderState = await transaction.getCustomerOrderState(customerId)
            hasQualifyingPriorOrder = customerOrderState?.hasQualifyingOrder === true ||
              await transaction.hasPriorCustomerOrder(customerId)
          }
          const couponItems = coupon.storeId
            ? authoritativeItems.filter((item) => item.storeId === coupon.storeId)
            : authoritativeItems
          const discount = calculateCoupon(coupon, couponItems, {
            now: currentTime,
            storeId: coupon.storeId,
            customerUsageCount,
            hasQualifyingPriorOrder,
          })
          return { valid: true, discount }
        } catch (error) {
          if (error instanceof TrustedDomainError &&
            ['failed-precondition', 'resource-exhausted'].includes(error.code)) {
            return { valid: false, discount: 0, message: error.message }
          }
          throw error
        }
      })
    },

    async subscribeNewsletter(raw) {
      const email = normalizeNewsletterEmail(raw)
      const subscriptionId = trustedDigest(
        digest,
        `vendora.newsletter.v1\u0000${email}`,
      )
      return transact(async (transaction) => {
        const existing = await transaction.getNewsletterSubscription(subscriptionId)
        if (existing) {
          if (existing.email !== email) domainFail('internal', 'Newsletter subscription conflict.')
          return { subscribed: true }
        }
        transaction.createNewsletterSubscription(subscriptionId, { email })
        return { subscribed: true }
      })
    },

    async placeOrder(raw) {
      const input = operationInput(raw, ['actor', 'intent'])
      const customerId = verifiedPrincipalId(input.actor)
      const intent = normalizeCheckoutIntent(input.intent)
      const requestId = trustedDigest(
        digest,
        `vendora.checkout-idempotency.v1\u0000${customerId}\u0000${intent.idempotencyKey}`,
      )
      // Preserve the pre-portability checkoutRequests document identity. The
      // collection path already scopes this hash by the verified customer ID.
      const persistedRequestId = trustedDigest(digest, intent.idempotencyKey)
      const requestHash = trustedDigest(digest, canonicalHashInput(intent))
      return correlateCheckoutRequest(transact(async (transaction) => {
        const user = await transaction.getUser(customerId)
        if (!user || user.role !== 'customer' || user.suspended === true) {
          domainFail('permission-denied', 'This account cannot place orders.')
        }

        const existingRequest = await transaction.getCheckoutRequest(customerId, persistedRequestId)
        if (existingRequest) {
          if (existingRequest.requestHash !== requestHash) {
            domainFail('already-exists', 'This checkout request ID has already been used.')
          }
          return existingRequest.result
        }

        const customerOrderState = await transaction.getCustomerOrderState(customerId)
        let hasQualifyingPriorOrder = customerOrderState?.hasQualifyingOrder === true
        const productIds = [...new Set(intent.items.map((item) => item.productId))]
        const products = exactKeyedRecords(
          await transaction.getProducts(productIds),
          productIds,
          PRODUCT_UNAVAILABLE,
        )

        const currentTime = trustedNow(now)
        const requestedByProduct = new Map()
        const requestedByVariant = new Map()
        const inventories = new Map()
        const authoritativeItems = intent.items.map((item) => {
          const product = products.get(item.productId)
          if (!product || product.status !== 'approved' || product.publiclyVisible !== true) {
            domainFail('failed-precondition', PRODUCT_UNAVAILABLE)
          }
          const inventory = inventories.get(item.productId) ?? authoritativeProductInventory(
            product,
            PRODUCT_UNAVAILABLE,
          )
          inventories.set(item.productId, inventory)
          if (inventory.hasVariants && !item.variantId) domainFail('failed-precondition', PRODUCT_UNAVAILABLE)
          if (!inventory.hasVariants && item.variantId) domainFail('failed-precondition', PRODUCT_UNAVAILABLE)
          const selectedVariant = item.variantId ? inventory.byId.get(item.variantId) : undefined
          if (item.variantId && !selectedVariant) domainFail('failed-precondition', PRODUCT_UNAVAILABLE)
          requestedByProduct.set(item.productId, (requestedByProduct.get(item.productId) ?? 0) + item.quantity)
          if (selectedVariant) {
            const key = `${item.productId}\u0000${selectedVariant.id}`
            requestedByVariant.set(key, (requestedByVariant.get(key) ?? 0) + item.quantity)
          }
          const { price, variant } = currentProductPrice(
            product,
            item.variantId,
            currentTime,
            PRODUCT_UNAVAILABLE,
          )
          return {
            productId: item.productId,
            storeId: product.storeId,
            merchantId: product.merchantId,
            name: trustedString(product.name, 'Product name', 1, 500),
            imageUrl: variant?.imageUrl ?? product.images?.[0],
            price,
            quantity: item.quantity,
            variantId: item.variantId,
            variant: variant?.options,
            sku: variant?.sku ?? product.sku,
            inventoryAuthority: variant ? 'variant' : 'product',
          }
        })

        for (const [productId, requestedQuantity] of requestedByProduct) {
          const product = products.get(productId)
          const minimum = Number.isSafeInteger(product.minOrderQty) ? product.minOrderQty : 1
          const maximum = Number.isSafeInteger(product.maxOrderQty)
            ? product.maxOrderQty
            : Number.MAX_SAFE_INTEGER
          if (
            requestedQuantity < minimum ||
            requestedQuantity > maximum ||
            !Number.isSafeInteger(product.soldCount) ||
            product.soldCount < 0
          ) {
            domainFail('failed-precondition', PRODUCT_UNAVAILABLE)
          }
          const inventory = inventories.get(productId)
          if (!inventory.hasVariants && inventory.stock < requestedQuantity) {
            domainFail('failed-precondition', PRODUCT_UNAVAILABLE)
          }
        }
        for (const [key, requestedQuantity] of requestedByVariant) {
          const separator = key.indexOf('\u0000')
          const productId = key.slice(0, separator)
          const variantId = key.slice(separator + 1)
          const variant = inventories.get(productId)?.byId.get(variantId)
          if (!variant || variant.stock < requestedQuantity) {
            domainFail('failed-precondition', PRODUCT_UNAVAILABLE)
          }
        }

        const storeIds = [...new Set(authoritativeItems.map((item) => item.storeId))]
        if (storeIds.some((id) => typeof id !== 'string' || !id)) {
          domainFail('failed-precondition', 'One or more stores are unavailable.')
        }
        const stores = exactKeyedRecords(
          await transaction.getStores(storeIds),
          storeIds,
          'One or more stores are unavailable.',
        )
        const groups = storeIds.map((storeId) => {
          const store = stores.get(storeId)
          const items = authoritativeItems.filter((item) => item.storeId === storeId)
          if (
            store.status !== 'approved' ||
            !store.ownerId ||
            items.some((item) => item.merchantId !== store.ownerId)
          ) {
            domainFail('failed-precondition', 'One or more stores are unavailable.')
          }
          const subtotal = money(items.reduce((sum, item) => sum + item.price * item.quantity, 0))
          const shippingFee = calculateShippingFee(
            store,
            subtotal,
            'Store shipping details are unavailable.',
          )
          return { storeId, store, items, subtotal, shippingFee }
        })

        let coupon = null
        let customerUsage = null
        let couponUsageId = null
        let totalDiscount = 0
        let couponBasis = 0
        let allocations = new Map(groups.map((group) => [group.storeId, 0]))
        if (intent.couponCode) {
          const matches = await transaction.findCouponsByCode(intent.couponCode)
          coupon = storeIds
            .map((storeId) => matches.find((candidate) => candidate.storeId === storeId))
            .find(Boolean) ?? matches.find((candidate) => !candidate.storeId)
          if (!coupon) domainFail('failed-precondition', 'This promo code is not valid.')
          customerUsage = await transaction.getCustomerCouponUsage(coupon.id, customerId)
          const customerUsageCount = customerUsage ? Number(customerUsage.count) : 0
          if (!Number.isSafeInteger(customerUsageCount) || customerUsageCount < 0) {
            domainFail('failed-precondition', 'This promo code is not valid.')
          }
          if (coupon.type === 'first_order' && !hasQualifyingPriorOrder) {
            hasQualifyingPriorOrder = await transaction.hasPriorCustomerOrder(customerId)
          }
          const couponItems = coupon.storeId
            ? (groups.find((group) => group.storeId === coupon.storeId)?.items ?? [])
            : groups.flatMap((group) => group.items)
          totalDiscount = calculateCoupon(coupon, couponItems, {
            now: currentTime,
            storeId: coupon.storeId,
            customerUsageCount,
            hasQualifyingPriorOrder,
          })
          couponBasis = couponEligibleSubtotal(coupon, couponItems)
          allocations = allocateCoupon(coupon, totalDiscount, groups)
          couponUsageId = transaction.newCouponUsageId()
        }

        const preparedOrders = groups.map((group) => {
          const id = transaction.newOrderId()
          const number = createOrderNumber()
          const discount = allocations.get(group.storeId) ?? 0
          const total = money(group.subtotal - discount + group.shippingFee)
          const items = group.items.map(({ storeId: _storeId, merchantId: _merchantId, ...item }) =>
            Object.fromEntries(Object.entries(item).filter(([, value]) => value !== undefined)),
          )
          return { group, id, number, discount, total, items }
        })
        const result = {
          orderIds: preparedOrders.map(({ id }) => id),
          orderNumbers: preparedOrders.map(({ number }) => number),
        }

        for (const prepared of preparedOrders) {
          const { group } = prepared
          const hasCoupon = prepared.discount > 0 && coupon && couponUsageId
          transaction.createOrder(prepared.id, {
            orderNumber: prepared.number,
            customerId,
            customerName: intent.delivery.fullName,
            customerEmail: intent.delivery.email,
            customerPhone: intent.delivery.phone,
            storeId: group.storeId,
            merchantId: group.store.ownerId,
            storeName: group.store.name,
            items: prepared.items,
            subtotal: group.subtotal,
            discount: prepared.discount,
            ...(hasCoupon ? {
              couponId: coupon.id,
              couponCode: coupon.code,
              couponBasis,
              couponUsageId,
            } : {}),
            shippingFee: group.shippingFee,
            tax: 0,
            total: prepared.total,
            paymentMethod: intent.paymentMethod,
            cashReceived: false,
            status: 'pending',
            shippingAddress: intent.delivery.address,
            ...(intent.specialInstructions ? { specialInstructions: intent.specialInstructions } : {}),
            ...(intent.giftNote ? { giftNote: intent.giftNote } : {}),
            timeline: [{ status: 'pending', at: currentTime, by: customerId, note: 'Order placed' }],
          })
          transaction.createActivityLog({
            actorId: customerId,
            actorName: intent.delivery.fullName,
            actorRole: 'customer',
            action: 'order.placed',
            targetType: 'order',
            targetId: prepared.id,
            detail: prepared.number,
          })
          transaction.createNotification({
            userId: group.store.ownerId,
            type: 'order_update',
            title: 'New order received',
            body: `Order ${prepared.number} — ${prepared.items.length} item(s), total ${prepared.total.toFixed(2)}.`,
            linkUrl: `/merchant/orders/${prepared.id}`,
            read: false,
          })
        }

        for (const [productId, requestedQuantity] of requestedByProduct) {
          const product = products.get(productId)
          const inventory = inventories.get(productId)
          const variants = inventory.hasVariants
            ? inventory.variants.map((variant) => {
                const requested = requestedByVariant.get(`${productId}\u0000${variant.id}`) ?? 0
                return requested ? { ...variant, stock: variant.stock - requested } : variant
              })
            : undefined
          transaction.updateProduct(productId, {
            stock: product.stock - requestedQuantity,
            ...(variants ? { variants } : {}),
            soldCount: product.soldCount + requestedQuantity,
          })
        }

        if (coupon && couponUsageId) {
          const discountedOrderIds = preparedOrders
            .filter((prepared) => prepared.discount > 0)
            .map((prepared) => prepared.id)
          if (!discountedOrderIds.length || totalDiscount <= 0) {
            domainFail('failed-precondition', 'This promo code is not valid.')
          }
          const customerUsageCount = customerUsage ? Number(customerUsage.count) : 0
          transaction.updateCouponUsageCount(coupon.id, Number(coupon.usedCount) + 1)
          transaction.createCouponUsage(couponUsageId, {
            couponId: coupon.id,
            couponCode: coupon.code,
            customerId,
            orderIds: discountedOrderIds,
            discount: totalDiscount,
          })
          transaction.writeCustomerCouponUsage(coupon.id, customerId, {
            couponId: coupon.id,
            customerId,
            count: customerUsageCount + 1,
            lastUsageId: couponUsageId,
          }, Boolean(customerUsage))
        }

        transaction.writeCustomerOrderState(customerId, {
          customerId,
          hasQualifyingOrder: true,
        }, Boolean(customerOrderState))
        transaction.createCheckoutRequest(customerId, persistedRequestId, {
          customerId,
          idempotencyKeyHash: persistedRequestId,
          requestHash,
          result,
          expiresAtMillis: currentTime + idempotencyRetentionMs,
        })
        return result
      }), requestId)
    },

    async transitionOrder(raw) {
      const input = operationInput(raw, ['actor', 'orderId', 'nextStatus', 'note'])
      const actorId = verifiedPrincipalId(input.actor)
      const orderId = trustedIdentifier(input.orderId, 'Order')
      const nextStatus = trustedIdentifier(input.nextStatus, 'Next status', 1, 32)
      const note = trustedOptionalString(input.note, 'Note', 1, 1000)
      return transact(async (transaction) => {
        const context = await lifecycleContext(transaction, actorId, orderId)
        await assertMerchantAuthority(transaction, actorId, context, { allowAdmin: true })
        assertMerchantFulfillmentTransition(context.order.status, nextStatus)
        const currentTime = trustedNow(now)
        transaction.updateOrder(orderId, { status: nextStatus }, [
          { status: nextStatus, at: currentTime, by: actorId, ...(note ? { note } : {}) },
        ])
        orderActivity(transaction, {
          actorId,
          ...context,
          orderId,
          action: 'order.status_changed',
          detail: `${context.order.orderNumber} -> ${nextStatus}`,
        })
        orderNotification(
          transaction,
          context.order.customerId,
          orderId,
          `Order ${context.order.orderNumber} update`,
          `Your order is now ${nextStatus.replace(/_/g, ' ')}.`,
        )
        return { orderId, status: nextStatus }
      })
    },

    async confirmOrderCash(raw) {
      const input = operationInput(raw, ['actor', 'orderId'])
      const actorId = verifiedPrincipalId(input.actor)
      const orderId = trustedIdentifier(input.orderId, 'Order')
      return transact(async (transaction) => {
        const context = await lifecycleContext(transaction, actorId, orderId)
        await assertMerchantAuthority(transaction, actorId, context)
        assertCashConfirmationAllowed(context.order)
        const currentTime = trustedNow(now)
        transaction.updateOrder(orderId, {
          cashReceived: true,
          cashReceivedAt: currentTime,
          status: 'completed',
        }, [
          { status: 'cash_received', at: currentTime, by: actorId, note: 'Cash payment confirmed by merchant' },
          { status: 'completed', at: currentTime, by: actorId, note: 'Order completed automatically' },
        ])
        orderActivity(transaction, {
          actorId,
          ...context,
          orderId,
          action: 'order.cash_received',
          detail: context.order.orderNumber,
        })
        orderNotification(
          transaction,
          context.order.customerId,
          orderId,
          `Order ${context.order.orderNumber} completed`,
          'Payment received - thank you for shopping with us!',
        )
        return { orderId, status: 'completed', cashReceived: true }
      })
    },

    async requestOrderRefund(raw) {
      const input = operationInput(raw, ['actor', 'orderId', 'reason'])
      const actorId = verifiedPrincipalId(input.actor)
      const orderId = trustedIdentifier(input.orderId, 'Order')
      const reason = trustedString(input.reason, 'Return reason', 1, 1000)
      return transact(async (transaction) => {
        const context = await lifecycleContext(transaction, actorId, orderId)
        if (context.user.role !== 'customer' || context.order.customerId !== actorId) {
          domainFail('permission-denied', 'You cannot request a return for this order.')
        }
        assertReturnRequestAllowed(context.order.status)
        const currentTime = trustedNow(now)
        transaction.updateOrder(orderId, { status: 'refund_requested', returnReason: reason }, [
          { status: 'refund_requested', at: currentTime, by: actorId, note: reason },
        ])
        orderActivity(transaction, {
          actorId,
          ...context,
          orderId,
          action: 'order.status_changed',
          detail: `${context.order.orderNumber} -> refund_requested`,
        })
        orderNotification(
          transaction,
          context.order.merchantId,
          orderId,
          `Return requested for ${context.order.orderNumber}`,
          reason,
          '/merchant/orders',
        )
        return { orderId, status: 'refund_requested' }
      })
    },

    async decideOrderReturn(raw) {
      const input = operationInput(raw, ['actor', 'orderId', 'decision'])
      const actorId = verifiedPrincipalId(input.actor)
      const orderId = trustedIdentifier(input.orderId, 'Order')
      const decision = trustedIdentifier(input.decision, 'Decision', 1, 16)
      assertReturnDecision(decision)
      return transact(async (transaction) => {
        const context = await lifecycleContext(transaction, actorId, orderId)
        await assertMerchantAuthority(transaction, actorId, context, { allowAdmin: true })
        const nextStatus = returnDecisionStatus(context.order.status, decision)

        let returnInventory
        if (decision === 'approve') {
          const { quantities, variantQuantities, productPoolQuantities } =
            collectCancellationInventory(context.order.items)
          const productIds = [...quantities.keys()]
          const products = exactKeyedRecords(
            await transaction.getProducts(productIds),
            productIds,
            'Order inventory details are invalid.',
          )
          returnInventory = {
            quantities,
            variantQuantities,
            productPoolQuantities,
            products,
          }
        }

        const reviewer = context.user.role === 'admin' ? 'administrator' : 'merchant'
        const note = decision === 'approve'
          ? `Return approved by ${reviewer}`
          : `Refund request declined by ${reviewer}`
        const currentTime = trustedNow(now)
        transaction.updateOrder(orderId, { status: nextStatus }, [
          { status: nextStatus, at: currentTime, by: actorId, note },
        ])

        if (returnInventory) {
          for (const [productId, quantity] of returnInventory.quantities) {
            const restored = restoreCancelledProductInventory(
              returnInventory.products.get(productId),
              productId,
              quantity,
              returnInventory.variantQuantities,
              returnInventory.productPoolQuantities.get(productId) ?? 0,
            )
            transaction.updateProduct(productId, {
              stock: restored.stock,
              ...(restored.variants ? { variants: restored.variants } : {}),
              soldCount: restored.soldCount,
            })
          }
        }
        orderActivity(transaction, {
          actorId,
          ...context,
          orderId,
          action: 'order.status_changed',
          detail: `${context.order.orderNumber} -> ${nextStatus}`,
        })
        orderNotification(
          transaction,
          context.order.customerId,
          orderId,
          `Order ${context.order.orderNumber} update`,
          decision === 'approve' ? 'Your return request was approved.' : 'Your refund request was declined.',
        )
        return { orderId, status: nextStatus }
      })
    },

    async cancelOrder(raw) {
      const input = operationInput(raw, ['actor', 'orderId', 'reason'])
      const actorId = verifiedPrincipalId(input.actor)
      const orderId = trustedIdentifier(input.orderId, 'Order')
      const reason = trustedString(input.reason, 'Cancellation reason', 1, 1000)
      return transact(async (transaction) => {
        const [user, order] = await Promise.all([
          transaction.getUser(actorId),
          transaction.getOrder(orderId),
        ])
        if (!user || user.suspended === true) {
          domainFail('permission-denied', 'This account cannot cancel orders.')
        }
        if (!order) domainFail('not-found', 'Order not found.')
        const authorized =
          user.role === 'admin' ||
          (user.role === 'customer' && order.customerId === actorId) ||
          (user.role === 'merchant' && order.merchantId === actorId)
        if (!authorized) domainFail('permission-denied', 'You cannot cancel this order.')
        assertCancellationAllowed(order.status)

        const { quantities, variantQuantities, productPoolQuantities } =
          collectCancellationInventory(order.items)
        const productIds = [...quantities.keys()]
        const products = exactKeyedRecords(
          await transaction.getProducts(productIds),
          productIds,
          'Order inventory details are invalid.',
        )
        const currentTime = trustedNow(now)
        transaction.updateOrder(orderId, { status: 'cancelled', cancelReason: reason }, [
          { status: 'cancelled', at: currentTime, by: actorId, note: reason },
        ])
        for (const [productId, quantity] of quantities) {
          const restored = restoreCancelledProductInventory(
            products.get(productId),
            productId,
            quantity,
            variantQuantities,
            productPoolQuantities.get(productId) ?? 0,
          )
          transaction.updateProduct(productId, {
            stock: restored.stock,
            ...(restored.variants ? { variants: restored.variants } : {}),
            soldCount: restored.soldCount,
          })
        }
        orderActivity(transaction, {
          actorId,
          user,
          order,
          orderId,
          action: 'order.status_changed',
          detail: `${order.orderNumber} → cancelled`,
        })
        const cancelledByCustomer = user.role === 'customer'
        orderNotification(
          transaction,
          cancelledByCustomer ? order.merchantId : order.customerId,
          orderId,
          `Order ${order.orderNumber} cancelled`,
          reason,
          cancelledByCustomer ? '/merchant/orders' : '/account/orders',
        )
        return { orderId, status: 'cancelled' }
      })
    },
  })
}
