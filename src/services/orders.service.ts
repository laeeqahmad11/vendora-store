import {
  arrayUnion,
  collection,
  doc,
  increment,
  limit,
  orderBy,
  runTransaction,
  serverTimestamp,
  where,
  type QueryConstraint,
} from 'firebase/firestore'
import {
  COLLECTIONS,
  NEXT_ORDER_STATUS,
} from '@/lib/constants'
import {
  convertDocTimestamps,
  getDocById,
  queryDocs,
  updateDocument,
} from '@/services/firestore'
import { activityService } from '@/services/activity.service'
import { notificationsService } from '@/services/notifications.service'
import { productsService } from '@/services/products.service'
import { db } from '@/lib/firebase'
import { generateOrderNumber, stripUndefined } from '@/lib/utils'
import {
  allocateCouponDiscount,
  couponEligibleSubtotal,
  validateAndCalculateCoupon,
} from '@/lib/coupons'
import type {
  CartItem,
  Coupon,
  Order,
  OrderStatus,
  OrderTimelineEntry,
  Product,
  Store,
  UserRole,
} from '@/types'

interface Actor {
  id: string
  name: string
  role: UserRole
}

const unavailableProductMessage =
  'One or more products are unavailable or their stock changed. Please review your cart and try again.'

function inventoryError(): Error {
  return new Error(unavailableProductMessage)
}

function checkoutChangedError(): Error {
  return new Error(
    'Product pricing, shipping, or promo details changed. Please review your cart and apply the promo code again.',
  )
}

const money = (value: number) => Math.round(value * 100) / 100

function currentProductPrice(
  product: Product,
  variantId: string | undefined,
  now: number,
): number {
  const variant = variantId
    ? product.variants?.find((item) => item.id === variantId)
    : undefined

  if (variantId && !variant) throw inventoryError()
  if (variant?.price != null) return variant.price
  if (product.flashSale?.active && product.flashSale.endsAt > now) {
    return product.flashSale.salePrice
  }
  return product.price
}

/**
 * Firestore does not accept undefined values.
 *
 * This helper creates a valid timeline entry and only adds `note`
 * when it contains a real non-empty value.
 */
function createTimelineEntry(
  status: OrderTimelineEntry['status'],
  actorId: string,
  note?: string,
  at = Date.now(),
): OrderTimelineEntry {
  const cleanNote = note?.trim()

  return {
    status,
    at,
    by: actorId,
    ...(cleanNote ? { note: cleanNote } : {}),
  }
}

/**
 * Removes undefined top-level properties before sending data
 * to Firestore.
 */
function removeUndefinedValues(
  data: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(data).filter(
      ([, value]) => value !== undefined,
    ),
  )
}

async function recordStatusChange(
  order: Order,
  entry: OrderTimelineEntry,
  actor: Actor,
  extra: Record<string, unknown> = {},
) {
  const cleanEntry = removeUndefinedValues({
    status: entry.status,
    at: entry.at,
    by: entry.by,
    note: entry.note,
  }) as unknown as OrderTimelineEntry

  const cleanExtra = removeUndefinedValues(extra)

  await updateDocument(
    COLLECTIONS.orders,
    order.id,
    {
      status:
        entry.status === 'cash_received'
          ? order.status
          : entry.status,

      timeline: arrayUnion(cleanEntry),

      ...cleanExtra,
    },
  )

  await activityService.log(
    actor,
    'order.status_changed',
    'order',
    order.id,
    `${order.orderNumber} → ${entry.status}`,
  )

  await notificationsService.notify(
    order.customerId,
    {
      type: 'order_update',
      title: `Order ${order.orderNumber} update`,
      body: `Your order is now ${entry.status.replace(
        /_/g,
        ' ',
      )}.`,
      linkUrl: `/account/orders/${order.id}`,
    },
  )
}

export const ordersService = {
  /**
   * Places one order per store from the cart contents,
   * decrements stock and increases soldCount.
   *
   * Returns the created order IDs.
   */
  async placeOrders(
    orders: Omit<
      Order,
      | 'id'
      | 'orderNumber'
      | 'timeline'
      | 'status'
      | 'cashReceived'
      | 'createdAt'
      | 'updatedAt'
    >[],
    actor: Actor,
    couponId?: string,
  ): Promise<string[]> {
    if (orders.length === 0) return []

    const preparedOrders = orders.map((data) => ({
      data,
      ref: doc(collection(db, COLLECTIONS.orders)),
      orderNumber: generateOrderNumber(),
      initialTimelineEntry: createTimelineEntry(
        'pending',
        actor.id,
        'Order placed',
      ),
    }))

    const requestedByProduct = new Map<string, number>()

    for (const { data } of preparedOrders) {
      if (data.items.length === 0) throw inventoryError()

      for (const item of data.items) {
        if (!Number.isSafeInteger(item.quantity) || item.quantity <= 0) {
          throw inventoryError()
        }

        requestedByProduct.set(
          item.productId,
          (requestedByProduct.get(item.productId) ?? 0) + item.quantity,
        )
      }
    }

    const productRefs = new Map(
      [...requestedByProduct.keys()].map((productId) => [
        productId,
        doc(db, COLLECTIONS.products, productId),
      ]),
    )
    const storeRefs = new Map(
      preparedOrders.map(({ data }) => [
        data.storeId,
        doc(db, COLLECTIONS.stores, data.storeId),
      ]),
    )
    const couponRef = couponId
      ? doc(db, COLLECTIONS.coupons, couponId)
      : null
    const customerCouponUsageRef = couponId
      ? doc(db, 'customerCouponUsages', `${couponId}_${actor.id}`)
      : null
    const couponUsageRef = couponId
      ? doc(collection(db, 'couponUsages'))
      : null

    await runTransaction(db, async (transaction) => {
      // All authoritative reads happen before writes. Firestore retries this
      // callback when a concurrent checkout changes any product snapshot.
      const currentProducts = new Map<string, Product>()
      const currentStores = new Map<string, Store>()

      for (const [productId, productRef] of productRefs) {
        const snapshot = await transaction.get(productRef)

        if (!snapshot.exists()) throw inventoryError()

        currentProducts.set(productId, {
          id: snapshot.id,
          ...snapshot.data(),
        } as Product)
      }

      for (const [storeId, storeRef] of storeRefs) {
        const snapshot = await transaction.get(storeRef)
        if (!snapshot.exists()) throw checkoutChangedError()
        currentStores.set(storeId, {
          id: snapshot.id,
          ...convertDocTimestamps(snapshot.data()),
        } as Store)
      }

      const couponSnapshot = couponRef
        ? await transaction.get(couponRef)
        : null
      const customerCouponUsageSnapshot = customerCouponUsageRef
        ? await transaction.get(customerCouponUsageRef)
        : null

      if (couponRef && !couponSnapshot?.exists()) throw checkoutChangedError()

      const currentCoupon = couponSnapshot?.exists()
        ? ({
            id: couponSnapshot.id,
            ...convertDocTimestamps(couponSnapshot.data()),
          } as Coupon)
        : null
      const customerCouponUsageCount = customerCouponUsageSnapshot?.exists()
        ? Number(customerCouponUsageSnapshot.data().count)
        : 0
      const checkoutTime = Date.now()

      for (const { data } of preparedOrders) {
        const store = currentStores.get(data.storeId)
        if (
          !store ||
          store.status !== 'approved' ||
          store.ownerId !== data.merchantId
        ) {
          throw checkoutChangedError()
        }

        for (const item of data.items) {
          const product = currentProducts.get(item.productId)

          if (
            !product ||
            product.status !== 'approved' ||
            product.storeId !== data.storeId ||
            product.merchantId !== data.merchantId ||
            item.quantity < (product.minOrderQty ?? 1) ||
            item.quantity > (product.maxOrderQty ?? Number.POSITIVE_INFINITY)
          ) {
            throw inventoryError()
          }


          if (
            money(item.price) !==
            money(currentProductPrice(product, item.variantId, checkoutTime))
          ) {
            throw checkoutChangedError()
          }
        }


        const authoritativeSubtotal = money(
          data.items.reduce(
            (sum, item) => sum + item.price * item.quantity,
            0,
          ),
        )
        const shippingFee =
          store.shippingEnabled === false
            ? 0
            : store.freeShippingThreshold &&
                authoritativeSubtotal >= store.freeShippingThreshold
              ? 0
              : Math.max(0, store.shippingFee ?? 0)

        if (
          money(data.subtotal) !== authoritativeSubtotal ||
          money(data.shippingFee) !== money(shippingFee) ||
          data.tax !== 0
        ) {
          throw checkoutChangedError()
        }
      }

      const couponGroups = preparedOrders.map(({ data }) => ({
        storeId: data.storeId,
        subtotal: data.subtotal,
        items: data.items.map(
          (item): CartItem => ({
            productId: item.productId,
            storeId: data.storeId,
            storeName: data.storeName,
            name: item.name,
            imageUrl: item.imageUrl,
            price: item.price,
            quantity: item.quantity,
            stock: currentProducts.get(item.productId)!.stock,
            variantId: item.variantId,
            variant: item.variant,
          }),
        ),
      }))
      let couponAllocations = new Map(
        couponGroups.map((group) => [group.storeId, 0]),
      )
      let totalCouponDiscount = 0
      let couponBasis = 0

      if (currentCoupon) {
        const validationItems = currentCoupon.storeId
          ? couponGroups.find(
              (group) => group.storeId === currentCoupon.storeId,
            )?.items ?? []
          : couponGroups.flatMap((group) => group.items)

        totalCouponDiscount = validateAndCalculateCoupon(
          currentCoupon,
          validationItems,
          {
            now: checkoutTime,
            storeId: currentCoupon.storeId,
            customerUsageCount: customerCouponUsageCount,
          },
        )
        couponBasis = couponEligibleSubtotal(currentCoupon, validationItems)
        couponAllocations = allocateCouponDiscount(
          currentCoupon,
          totalCouponDiscount,
          couponGroups,
        )
      }

      for (const { data } of preparedOrders) {
        const expectedDiscount = couponAllocations.get(data.storeId) ?? 0
        const expectedTotal = money(
          data.subtotal - expectedDiscount + data.shippingFee + data.tax,
        )
        if (
          money(data.discount) !== expectedDiscount ||
          money(data.total) !== expectedTotal ||
          (expectedDiscount > 0
            ? data.couponCode !== currentCoupon?.code
            : Boolean(data.couponCode))
        ) {
          throw checkoutChangedError()
        }
      }

      for (const [productId, requestedQuantity] of requestedByProduct) {
        const product = currentProducts.get(productId)

        if (
          !product ||
          !Number.isSafeInteger(product.stock) ||
          product.stock < requestedQuantity
        ) {
          throw inventoryError()
        }
      }

      for (const prepared of preparedOrders) {
        const hasCouponDiscount =
          (couponAllocations.get(prepared.data.storeId) ?? 0) > 0
        const cleanOrderData = stripUndefined(
          prepared.data as unknown as Record<string, unknown>,
        )
        cleanOrderData.items = prepared.data.items.map((item) =>
          stripUndefined(item as unknown as Record<string, unknown>),
        )
        transaction.set(prepared.ref, {
          ...cleanOrderData,
          orderNumber: prepared.orderNumber,
          status: 'pending',
          cashReceived: false,
          timeline: [prepared.initialTimelineEntry],
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          ...(hasCouponDiscount && currentCoupon && couponUsageRef
            ? {
                couponId: currentCoupon.id,
                couponBasis,
                couponUsageId: couponUsageRef.id,
              }
            : {}),
        })
      }

      for (const [productId, requestedQuantity] of requestedByProduct) {
        const product = currentProducts.get(productId)!

        transaction.update(productRefs.get(productId)!, {
          stock: product.stock - requestedQuantity,
          soldCount: product.soldCount + requestedQuantity,
          updatedAt: serverTimestamp(),
        })
      }


      if (
        currentCoupon &&
        couponRef &&
        couponUsageRef &&
        customerCouponUsageRef
      ) {
        const discountedOrderIds = preparedOrders
          .filter(
            ({ data }) => (couponAllocations.get(data.storeId) ?? 0) > 0,
          )
          .map(({ ref }) => ref.id)

        if (!discountedOrderIds.length || totalCouponDiscount <= 0) {
          throw checkoutChangedError()
        }

        transaction.update(couponRef, {
          usedCount: currentCoupon.usedCount + 1,
          updatedAt: serverTimestamp(),
        })
        transaction.set(couponUsageRef, {
          couponId: currentCoupon.id,
          couponCode: currentCoupon.code,
          customerId: actor.id,
          orderIds: discountedOrderIds,
          discount: totalCouponDiscount,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        })
        transaction.set(customerCouponUsageRef, {
          couponId: currentCoupon.id,
          customerId: actor.id,
          count: customerCouponUsageCount + 1,
          lastUsageId: couponUsageRef.id,
          createdAt: customerCouponUsageSnapshot?.exists()
            ? customerCouponUsageSnapshot.data().createdAt
            : serverTimestamp(),
          updatedAt: serverTimestamp(),
        })
      }
    })

    const ids: string[] = []

    for (const { data, ref, orderNumber } of preparedOrders) {
      const id = ref.id
      ids.push(id)

      // Best-effort side effects:
      // order placement must not fail if one of these fails.
      await Promise.allSettled([
        activityService.log(
          actor,
          'order.placed',
          'order',
          id,
          orderNumber,
        ),

        notificationsService.notify(
          data.merchantId,
          {
            type: 'order_update',
            title: 'New order received',
            body: `Order ${orderNumber} — ${data.items.length} item(s), total ${data.total.toFixed(
              2,
            )}.`,
            linkUrl: `/merchant/orders/${id}`,
          },
        ),
      ])
    }

    return ids
  },

  async getById(id: string) {
    return getDocById<Order>(
      COLLECTIONS.orders,
      id,
    )
  },

  async listByCustomer(
    customerId: string,
  ) {
    return queryDocs<Order>(
      COLLECTIONS.orders,
      where(
        'customerId',
        '==',
        customerId,
      ),
      orderBy('createdAt', 'desc'),
    )
  },

  async listByStore(
    storeId: string,
    status?: OrderStatus,
  ) {
    const constraints: QueryConstraint[] =
      [
        where(
          'storeId',
          '==',
          storeId,
        ),
        orderBy('createdAt', 'desc'),
      ]

    if (status) {
      constraints.splice(
        1,
        0,
        where(
          'status',
          '==',
          status,
        ),
      )
    }

    return queryDocs<Order>(
      COLLECTIONS.orders,
      ...constraints,
    )
  },

  async listAll(count = 200) {
    return queryDocs<Order>(
      COLLECTIONS.orders,
      orderBy('createdAt', 'desc'),
      limit(count),
    )
  },

  /**
   * Advances an order to the next status
   * in the merchant fulfilment workflow.
   */
  async advanceStatus(
    order: Order,
    actor: Actor,
    note?: string,
  ) {
    const next =
      NEXT_ORDER_STATUS[order.status]

    if (!next) {
      throw new Error(
        `Order cannot advance from status "${order.status}"`,
      )
    }

    const entry = createTimelineEntry(
      next,
      actor.id,
      note,
    )

    await recordStatusChange(
      order,
      entry,
      actor,
    )

    return next
  },

  async setStatus(
    order: Order,
    status: OrderStatus,
    actor: Actor,
    note?: string,
  ) {
    const entry = createTimelineEntry(
      status,
      actor.id,
      note,
    )

    await recordStatusChange(
      order,
      entry,
      actor,
    )
  },

  /**
   * Merchant confirms that cash was collected.
   * This automatically completes the order.
   */
  async markCashReceived(
    order: Order,
    actor: Actor,
  ) {
    if (order.status !== 'delivered') {
      throw new Error(
        'Cash can only be confirmed after delivery.',
      )
    }

    const now = Date.now()

    const cashEntry =
      createTimelineEntry(
        'cash_received',
        actor.id,
        'Cash payment confirmed by merchant',
        now,
      )

    const completedEntry =
      createTimelineEntry(
        'completed',
        actor.id,
        'Order completed automatically',
        now,
      )

    await updateDocument(
      COLLECTIONS.orders,
      order.id,
      {
        cashReceived: true,
        cashReceivedAt: now,
        status: 'completed',

        timeline: arrayUnion(
          cashEntry,
          completedEntry,
        ),
      },
    )

    await activityService.log(
      actor,
      'order.cash_received',
      'order',
      order.id,
      order.orderNumber,
    )

    await notificationsService.notify(
      order.customerId,
      {
        type: 'order_update',
        title: `Order ${order.orderNumber} completed`,
        body:
          'Payment received — thank you for shopping with us!',
        linkUrl: `/account/orders/${order.id}`,
      },
    )
  },

  /**
   * Cancels a pending or confirmed order
   * and restores the stock.
   */
  async cancel(
    order: Order,
    actor: Actor,
    reason: string,
  ) {
    if (
      !['pending', 'confirmed'].includes(
        order.status,
      )
    ) {
      throw new Error(
        'Only pending or confirmed orders can be cancelled.',
      )
    }

    const cleanReason =
      reason.trim() ||
      'Order cancelled'

    const entry = createTimelineEntry(
      'cancelled',
      actor.id,
      cleanReason,
    )

    await recordStatusChange(
      order,
      entry,
      actor,
      {
        cancelReason: cleanReason,
      },
    )

    await Promise.allSettled(
      order.items.map((item) =>
        updateDocument(
          COLLECTIONS.products,
          item.productId,
          {
            stock: increment(
              item.quantity,
            ),
            soldCount: increment(
              -item.quantity,
            ),
          },
        ),
      ),
    )

    await notificationsService.notify(
      order.merchantId,
      {
        type: 'order_update',
        title: `Order ${order.orderNumber} cancelled`,
        body: cleanReason,
        linkUrl: `/merchant/orders/${order.id}`,
      },
    )
  },

  async requestReturn(
    order: Order,
    actor: Actor,
    reason: string,
  ) {
    if (
      ![
        'delivered',
        'completed',
      ].includes(order.status)
    ) {
      throw new Error(
        'Returns can only be requested after delivery.',
      )
    }

    const cleanReason =
      reason.trim() ||
      'Return requested'

    const entry = createTimelineEntry(
      'refund_requested',
      actor.id,
      cleanReason,
    )

    await recordStatusChange(
      order,
      entry,
      actor,
      {
        returnReason: cleanReason,
      },
    )
  },

  /**
   * Fetches all products from a previous order
   * for the reorder workflow.
   */
  async reorderProducts(order: Order) {
    return productsService.getManyByIds(
      order.items.map(
        (item) => item.productId,
      ),
    )
  },
}
