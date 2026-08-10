import { createHash, randomBytes } from 'node:crypto'

import { getApps, initializeApp } from 'firebase-admin/app'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { HttpsError, onCall } from 'firebase-functions/v2/https'

if (!getApps().length) initializeApp()

const db = getFirestore()
db.settings({ ignoreUndefinedProperties: true })

const REGION = 'us-central1'
const MAX_ITEMS = 50
const ORDER_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

const productUnavailableMessage =
  'One or more products are unavailable or their stock changed. Please review your cart and try again.'

function fail(code, message) {
  throw new HttpsError(code, message)
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function cleanString(value, field, minimum, maximum, { optional = false } = {}) {
  if (optional && (value === undefined || value === null || value === '')) return undefined
  if (typeof value !== 'string') fail('invalid-argument', `${field} is invalid.`)
  const clean = value.trim()
  if (clean.length < minimum || clean.length > maximum) {
    fail('invalid-argument', `${field} is invalid.`)
  }
  return clean
}

function money(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function finiteMoney(value, message) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    fail('failed-precondition', message)
  }
  return money(value)
}

function millis(value) {
  if (typeof value === 'number') return value
  if (value && typeof value.toMillis === 'function') return value.toMillis()
  return undefined
}

function orderNumber() {
  const bytes = randomBytes(6)
  let value = 'VND-'
  for (const byte of bytes) value += ORDER_ALPHABET[byte % ORDER_ALPHABET.length]
  return value
}

function parseCheckoutIntent(raw) {
  if (!isObject(raw)) fail('invalid-argument', 'Checkout request is invalid.')
  if (!Array.isArray(raw.items) || raw.items.length < 1 || raw.items.length > MAX_ITEMS) {
    fail('invalid-argument', 'Your cart must contain between 1 and 50 items.')
  }

  const items = raw.items.map((item) => {
    if (!isObject(item)) fail('invalid-argument', 'A cart item is invalid.')
    const productId = cleanString(item.productId, 'Product', 1, 128)
    const variantId = cleanString(item.variantId, 'Variant', 1, 128, { optional: true })
    if (!Number.isSafeInteger(item.quantity) || item.quantity <= 0) {
      fail('invalid-argument', 'Each item quantity must be a positive integer.')
    }
    return { productId, variantId, quantity: item.quantity }
  })

  if (!isObject(raw.delivery) || !isObject(raw.delivery.address)) {
    fail('invalid-argument', 'Delivery details are invalid.')
  }

  const address = raw.delivery.address
  const delivery = {
    fullName: cleanString(raw.delivery.fullName, 'Full name', 2, 100),
    email: cleanString(raw.delivery.email, 'Email', 3, 320),
    phone: cleanString(raw.delivery.phone, 'Phone', 6, 40),
    address: {
      fullName: cleanString(address.fullName, 'Address name', 2, 100),
      phone: cleanString(address.phone, 'Address phone', 6, 40),
      line1: cleanString(address.line1, 'Address line 1', 3, 200),
      line2: cleanString(address.line2, 'Address line 2', 1, 200, { optional: true }),
      city: cleanString(address.city, 'City', 2, 100),
      province: cleanString(address.province, 'Province', 2, 100),
      postalCode: cleanString(address.postalCode, 'Postal code', 2, 32),
      country: cleanString(address.country, 'Country', 2, 100),
    },
  }

  if (raw.paymentMethod !== 'cod') {
    fail('invalid-argument', 'Only Cash on Delivery is currently supported.')
  }

  return {
    items,
    delivery,
    paymentMethod: 'cod',
    couponCode: cleanString(raw.couponCode, 'Promo code', 3, 50, { optional: true })?.toUpperCase(),
    specialInstructions: cleanString(
      raw.specialInstructions,
      'Special instructions',
      1,
      2000,
      { optional: true },
    ),
    giftNote: cleanString(raw.giftNote, 'Gift note', 1, 1000, { optional: true }),
    idempotencyKey: cleanString(raw.idempotencyKey, 'Checkout request ID', 8, 128),
  }
}

function hashIntent(intent) {
  return createHash('sha256').update(JSON.stringify(intent)).digest('hex')
}

function currentPrice(product, variantId, now) {
  const variant = variantId
    ? product.variants?.find((candidate) => candidate?.id === variantId)
    : undefined

  if (variantId && !variant) fail('failed-precondition', productUnavailableMessage)
  if (variant?.price != null) {
    return { price: finiteMoney(variant.price, productUnavailableMessage), variant }
  }
  if (product.flashSale?.active === true && millis(product.flashSale.endsAt) > now) {
    return {
      price: finiteMoney(product.flashSale.salePrice, productUnavailableMessage),
      variant,
    }
  }
  return { price: finiteMoney(product.price, productUnavailableMessage), variant }
}

function couponEligibleItems(coupon, items) {
  const productIds = coupon.appliesTo?.productIds
  return Array.isArray(productIds) && productIds.length
    ? items.filter((item) => productIds.includes(item.productId))
    : items
}

function couponEligibleSubtotal(coupon, items) {
  return money(
    couponEligibleItems(coupon, items).reduce(
      (sum, item) => sum + item.price * item.quantity,
      0,
    ),
  )
}

function calculateCoupon(coupon, items, { now, storeId, customerUsageCount }) {
  if (coupon.active !== true) fail('failed-precondition', 'This promo code is not valid.')
  if (coupon.storeId && coupon.storeId !== storeId) {
    fail('failed-precondition', 'This promo code is not valid.')
  }
  const startsAt = millis(coupon.startsAt)
  const expiresAt = millis(coupon.expiresAt)
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
    fail(
      'resource-exhausted',
      'You have already reached the usage limit for this promo code.',
    )
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

  discount = finiteMoney(discount, 'This promo code is not valid.')
  if (coupon.maxDiscount) discount = Math.min(discount, coupon.maxDiscount)
  return Math.min(money(discount), eligibleSubtotal)
}

function allocateCoupon(coupon, totalDiscount, groups) {
  const eligible = groups
    .map((group) => ({
      group,
      eligibleSubtotal:
        coupon.storeId && coupon.storeId !== group.storeId
          ? 0
          : couponEligibleSubtotal(coupon, group.items),
    }))
    .filter(({ eligibleSubtotal }) => eligibleSubtotal > 0)
  const totalEligible = money(
    eligible.reduce((sum, entry) => sum + entry.eligibleSubtotal, 0),
  )
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

function checkoutOptions() {
  return {
    region: REGION,
    timeoutSeconds: 60,
    memory: '256MiB',
    maxInstances: 20,
  }
}

export const placeOrders = onCall(checkoutOptions(), async (request) => {
  if (!request.auth?.uid) fail('unauthenticated', 'You must be signed in to place an order.')

  const customerId = request.auth.uid
  const intent = parseCheckoutIntent(request.data)
  const requestHash = hashIntent(intent)
  const requestRef = db.doc(`checkoutRequests/${customerId}_${intent.idempotencyKey}`)

  return db.runTransaction(async (transaction) => {
    const existingRequest = await transaction.get(requestRef)
    if (existingRequest.exists) {
      if (existingRequest.get('requestHash') !== requestHash) {
        fail('already-exists', 'This checkout request ID has already been used.')
      }
      return existingRequest.get('result')
    }

    const userRef = db.doc(`users/${customerId}`)
    const userSnapshot = await transaction.get(userRef)
    if (
      !userSnapshot.exists ||
      userSnapshot.get('role') !== 'customer' ||
      userSnapshot.get('suspended') === true
    ) {
      fail('permission-denied', 'This account cannot place orders.')
    }

    const productIds = [...new Set(intent.items.map((item) => item.productId))]
    const productRefs = productIds.map((id) => db.doc(`products/${id}`))
    const productSnapshots = await transaction.getAll(...productRefs)
    const products = new Map()
    productSnapshots.forEach((snapshot) => {
      if (!snapshot.exists) fail('failed-precondition', productUnavailableMessage)
      products.set(snapshot.id, { id: snapshot.id, ...snapshot.data() })
    })

    const now = Date.now()
    const requestedByProduct = new Map()
    const authoritativeItems = intent.items.map((item) => {
      const product = products.get(item.productId)
      if (!product || product.status !== 'approved') {
        fail('failed-precondition', productUnavailableMessage)
      }
      requestedByProduct.set(
        item.productId,
        (requestedByProduct.get(item.productId) ?? 0) + item.quantity,
      )
      const { price, variant } = currentPrice(product, item.variantId, now)
      return {
        productId: item.productId,
        storeId: product.storeId,
        merchantId: product.merchantId,
        name: cleanString(product.name, 'Product name', 1, 500),
        imageUrl: variant?.imageUrl ?? product.images?.[0],
        price,
        quantity: item.quantity,
        variantId: item.variantId,
        variant: variant?.options,
        sku: variant?.sku ?? product.sku,
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
        !Number.isSafeInteger(product.stock) ||
        product.stock < requestedQuantity ||
        !Number.isSafeInteger(product.soldCount) ||
        product.soldCount < 0
      ) {
        fail('failed-precondition', productUnavailableMessage)
      }
    }

    const storeIds = [...new Set(authoritativeItems.map((item) => item.storeId))]
    if (storeIds.some((id) => typeof id !== 'string' || !id)) {
      fail('failed-precondition', 'One or more stores are unavailable.')
    }
    const storeRefs = storeIds.map((id) => db.doc(`stores/${id}`))
    const storeSnapshots = await transaction.getAll(...storeRefs)
    const stores = new Map()
    storeSnapshots.forEach((snapshot) => {
      if (!snapshot.exists) fail('failed-precondition', 'One or more stores are unavailable.')
      stores.set(snapshot.id, { id: snapshot.id, ...snapshot.data() })
    })

    const groups = storeIds.map((storeId) => {
      const store = stores.get(storeId)
      const items = authoritativeItems.filter((item) => item.storeId === storeId)
      if (
        store.status !== 'approved' ||
        !store.ownerId ||
        items.some((item) => item.merchantId !== store.ownerId)
      ) {
        fail('failed-precondition', 'One or more stores are unavailable.')
      }
      const subtotal = money(items.reduce((sum, item) => sum + item.price * item.quantity, 0))
      const shippingFeeValue = finiteMoney(
        store.shippingFee ?? 0,
        'Store shipping details are unavailable.',
      )
      const threshold = finiteMoney(
        store.freeShippingThreshold ?? 0,
        'Store shipping details are unavailable.',
      )
      const shippingFee =
        store.shippingEnabled === false || (threshold > 0 && subtotal >= threshold)
          ? 0
          : shippingFeeValue
      return { storeId, store, items, subtotal, shippingFee }
    })

    let coupon = null
    let couponRef = null
    let usageRef = null
    let customerUsageRef = null
    let customerUsageSnapshot = null
    let totalDiscount = 0
    let couponBasis = 0
    let allocations = new Map(groups.map((group) => [group.storeId, 0]))

    if (intent.couponCode) {
      const couponQuery = db
        .collection('coupons')
        .where('code', '==', intent.couponCode)
        .limit(5)
      const couponSnapshots = await transaction.get(couponQuery)
      const matches = couponSnapshots.docs.map((snapshot) => ({
        id: snapshot.id,
        ...snapshot.data(),
      }))
      coupon =
        matches.find((candidate) => !candidate.storeId) ??
        storeIds.map((storeId) => matches.find((candidate) => candidate.storeId === storeId)).find(Boolean)
      if (!coupon) fail('failed-precondition', 'This promo code is not valid.')

      couponRef = db.doc(`coupons/${coupon.id}`)
      customerUsageRef = db.doc(`customerCouponUsages/${coupon.id}_${customerId}`)
      customerUsageSnapshot = await transaction.get(customerUsageRef)
      const customerUsageCount = customerUsageSnapshot.exists
        ? Number(customerUsageSnapshot.get('count'))
        : 0
      if (!Number.isSafeInteger(customerUsageCount) || customerUsageCount < 0) {
        fail('failed-precondition', 'This promo code is not valid.')
      }

      const couponItems = coupon.storeId
        ? groups.find((group) => group.storeId === coupon.storeId)?.items ?? []
        : groups.flatMap((group) => group.items)
      totalDiscount = calculateCoupon(coupon, couponItems, {
        now,
        storeId: coupon.storeId,
        customerUsageCount,
      })
      couponBasis = couponEligibleSubtotal(coupon, couponItems)
      allocations = allocateCoupon(coupon, totalDiscount, groups)
      usageRef = db.collection('couponUsages').doc()
    }

    const preparedOrders = groups.map((group) => {
      const ref = db.collection('orders').doc()
      const number = orderNumber()
      const discount = allocations.get(group.storeId) ?? 0
      const total = money(group.subtotal - discount + group.shippingFee)
      const items = group.items.map(({ storeId: _storeId, merchantId: _merchantId, ...item }) =>
        Object.fromEntries(Object.entries(item).filter(([, value]) => value !== undefined)),
      )
      return { group, ref, number, discount, total, items }
    })
    const result = {
      orderIds: preparedOrders.map(({ ref }) => ref.id),
      orderNumbers: preparedOrders.map(({ number }) => number),
    }

    for (const prepared of preparedOrders) {
      const { group } = prepared
      const hasCoupon = prepared.discount > 0 && coupon && usageRef
      transaction.set(prepared.ref, {
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
        ...(hasCoupon
          ? {
              couponId: coupon.id,
              couponCode: coupon.code,
              couponBasis,
              couponUsageId: usageRef.id,
            }
          : {}),
        shippingFee: group.shippingFee,
        tax: 0,
        total: prepared.total,
        paymentMethod: intent.paymentMethod,
        cashReceived: false,
        status: 'pending',
        shippingAddress: intent.delivery.address,
        ...(intent.specialInstructions ? { specialInstructions: intent.specialInstructions } : {}),
        ...(intent.giftNote ? { giftNote: intent.giftNote } : {}),
        timeline: [{ status: 'pending', at: now, by: customerId, note: 'Order placed' }],
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      })

      transaction.set(db.collection('activityLogs').doc(), {
        actorId: customerId,
        actorName: intent.delivery.fullName,
        actorRole: 'customer',
        action: 'order.placed',
        targetType: 'order',
        targetId: prepared.ref.id,
        detail: prepared.number,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      })
      transaction.set(db.collection('notifications').doc(), {
        userId: group.store.ownerId,
        type: 'order_update',
        title: 'New order received',
        body: `Order ${prepared.number} — ${prepared.items.length} item(s), total ${prepared.total.toFixed(2)}.`,
        linkUrl: `/merchant/orders/${prepared.ref.id}`,
        read: false,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      })
    }

    for (const [productId, requestedQuantity] of requestedByProduct) {
      const product = products.get(productId)
      transaction.update(db.doc(`products/${productId}`), {
        stock: product.stock - requestedQuantity,
        soldCount: product.soldCount + requestedQuantity,
        updatedAt: FieldValue.serverTimestamp(),
      })
    }

    if (coupon && couponRef && usageRef && customerUsageRef) {
      const discountedOrderIds = preparedOrders
        .filter((prepared) => prepared.discount > 0)
        .map((prepared) => prepared.ref.id)
      if (!discountedOrderIds.length || totalDiscount <= 0) {
        fail('failed-precondition', 'This promo code is not valid.')
      }
      const customerUsageCount = customerUsageSnapshot.exists
        ? Number(customerUsageSnapshot.get('count'))
        : 0
      transaction.update(couponRef, {
        usedCount: Number(coupon.usedCount) + 1,
        updatedAt: FieldValue.serverTimestamp(),
      })
      transaction.set(usageRef, {
        couponId: coupon.id,
        couponCode: coupon.code,
        customerId,
        orderIds: discountedOrderIds,
        discount: totalDiscount,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      })
      transaction.set(customerUsageRef, {
        couponId: coupon.id,
        customerId,
        count: customerUsageCount + 1,
        lastUsageId: usageRef.id,
        createdAt: customerUsageSnapshot.exists
          ? customerUsageSnapshot.get('createdAt')
          : FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      })
    }

    transaction.set(requestRef, {
      customerId,
      requestHash,
      result,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    })

    return result
  })
})

export const cancelOrder = onCall(checkoutOptions(), async (request) => {
  if (!request.auth?.uid) fail('unauthenticated', 'You must be signed in to cancel an order.')
  if (!isObject(request.data)) fail('invalid-argument', 'Cancellation request is invalid.')
  const uid = request.auth.uid
  const orderId = cleanString(request.data.orderId, 'Order', 1, 128)
  const reason = cleanString(request.data.reason, 'Cancellation reason', 1, 1000)

  return db.runTransaction(async (transaction) => {
    const userRef = db.doc(`users/${uid}`)
    const orderRef = db.doc(`orders/${orderId}`)
    const [userSnapshot, orderSnapshot] = await Promise.all([
      transaction.get(userRef),
      transaction.get(orderRef),
    ])
    if (!userSnapshot.exists || userSnapshot.get('suspended') === true) {
      fail('permission-denied', 'This account cannot cancel orders.')
    }
    if (!orderSnapshot.exists) fail('not-found', 'Order not found.')
    const user = userSnapshot.data()
    const order = orderSnapshot.data()
    const authorized =
      user.role === 'admin' ||
      (user.role === 'customer' && order.customerId === uid) ||
      (user.role === 'merchant' && order.merchantId === uid)
    if (!authorized) fail('permission-denied', 'You cannot cancel this order.')
    if (!['pending', 'confirmed'].includes(order.status)) {
      fail('failed-precondition', 'Only pending or confirmed orders can be cancelled.')
    }

    const quantities = new Map()
    for (const item of order.items ?? []) {
      if (!item?.productId || !Number.isSafeInteger(item.quantity) || item.quantity <= 0) {
        fail('failed-precondition', 'Order inventory details are invalid.')
      }
      quantities.set(item.productId, (quantities.get(item.productId) ?? 0) + item.quantity)
    }
    const productRefs = [...quantities.keys()].map((id) => db.doc(`products/${id}`))
    const productSnapshots = productRefs.length
      ? await transaction.getAll(...productRefs)
      : []
    const products = new Map(productSnapshots.map((snapshot) => [snapshot.id, snapshot.data()]))
    if (products.size !== quantities.size) {
      fail('failed-precondition', 'Order inventory details are invalid.')
    }

    const now = Date.now()
    transaction.update(orderRef, {
      status: 'cancelled',
      cancelReason: reason,
      timeline: FieldValue.arrayUnion({ status: 'cancelled', at: now, by: uid, note: reason }),
      updatedAt: FieldValue.serverTimestamp(),
    })
    for (const [productId, quantity] of quantities) {
      const product = products.get(productId)
      const stock = Number(product.stock)
      const soldCount = Number(product.soldCount)
      if (!Number.isSafeInteger(stock) || !Number.isSafeInteger(soldCount) || soldCount < quantity) {
        fail('failed-precondition', 'Order inventory details are invalid.')
      }
      transaction.update(db.doc(`products/${productId}`), {
        stock: stock + quantity,
        soldCount: soldCount - quantity,
        updatedAt: FieldValue.serverTimestamp(),
      })
    }
    transaction.set(db.collection('activityLogs').doc(), {
      actorId: uid,
      actorName: user.displayName ?? 'Vendora user',
      actorRole: user.role,
      action: 'order.status_changed',
      targetType: 'order',
      targetId: orderId,
      detail: `${order.orderNumber} → cancelled`,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    })
    transaction.set(db.collection('notifications').doc(), {
      userId: order.merchantId,
      type: 'order_update',
      title: `Order ${order.orderNumber} cancelled`,
      body: reason,
      linkUrl: `/merchant/orders/${orderId}`,
      read: false,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    })
    return { orderId, status: 'cancelled' }
  })
})
