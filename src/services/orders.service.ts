import { arrayUnion, increment, orderBy, where, limit, type QueryConstraint } from 'firebase/firestore'
import { COLLECTIONS, NEXT_ORDER_STATUS } from '@/lib/constants'
import { createDocument, getDocById, queryDocs, updateDocument } from '@/services/firestore'
import { activityService } from '@/services/activity.service'
import { notificationsService } from '@/services/notifications.service'
import { productsService } from '@/services/products.service'
import { generateOrderNumber } from '@/lib/utils'
import type { Order, OrderStatus, OrderTimelineEntry, UserRole } from '@/types'

interface Actor {
  id: string
  name: string
  role: UserRole
}

async function recordStatusChange(order: Order, entry: OrderTimelineEntry, actor: Actor, extra: Record<string, unknown> = {}) {
  await updateDocument(COLLECTIONS.orders, order.id, {
    status: entry.status === 'cash_received' ? order.status : entry.status,
    timeline: arrayUnion(entry),
    ...extra,
  })
  await activityService.log(actor, 'order.status_changed', 'order', order.id, `${order.orderNumber} → ${entry.status}`)
  await notificationsService.notify(order.customerId, {
    type: 'order_update',
    title: `Order ${order.orderNumber} update`,
    body: `Your order is now ${entry.status.replace(/_/g, ' ')}.`,
    linkUrl: `/account/orders/${order.id}`,
  })
}

export const ordersService = {
  /**
   * Places one order per store from the cart contents, decrements stock and
   * bumps soldCount. Returns the created order ids.
   */
  async placeOrders(
    orders: Omit<Order, 'id' | 'orderNumber' | 'timeline' | 'status' | 'cashReceived' | 'createdAt' | 'updatedAt'>[],
    actor: Actor,
  ): Promise<string[]> {
    const ids: string[] = []
    for (const data of orders) {
      const orderNumber = generateOrderNumber()
      const id = await createDocument<Order>(COLLECTIONS.orders, {
        ...data,
        orderNumber,
        status: 'pending',
        cashReceived: false,
        timeline: [{ status: 'pending', at: Date.now(), by: actor.id, note: 'Order placed' }],
      } as Omit<Order, 'id' | 'createdAt' | 'updatedAt'>)
      ids.push(id)

      // Best-effort side effects — order placement must not fail on these
      await Promise.allSettled([
        ...data.items.map((item) =>
          updateDocument(COLLECTIONS.products, item.productId, {
            stock: increment(-item.quantity),
            soldCount: increment(item.quantity),
          }),
        ),
        activityService.log(actor, 'order.placed', 'order', id, orderNumber),
        notificationsService.notify(data.merchantId, {
          type: 'order_update',
          title: 'New order received',
          body: `Order ${orderNumber} — ${data.items.length} item(s), total ${data.total.toFixed(2)}.`,
          linkUrl: `/merchant/orders/${id}`,
        }),
      ])
    }
    return ids
  },

  async getById(id: string) {
    return getDocById<Order>(COLLECTIONS.orders, id)
  },

  async listByCustomer(customerId: string) {
    return queryDocs<Order>(COLLECTIONS.orders, where('customerId', '==', customerId), orderBy('createdAt', 'desc'))
  },

  async listByStore(storeId: string, status?: OrderStatus) {
    const constraints: QueryConstraint[] = [where('storeId', '==', storeId), orderBy('createdAt', 'desc')]
    if (status) constraints.splice(1, 0, where('status', '==', status))
    return queryDocs<Order>(COLLECTIONS.orders, ...constraints)
  },

  async listAll(count = 200) {
    return queryDocs<Order>(COLLECTIONS.orders, orderBy('createdAt', 'desc'), limit(count))
  },

  /** Advance to the next status in the fulfilment flow (merchant action) */
  async advanceStatus(order: Order, actor: Actor, note?: string) {
    const next = NEXT_ORDER_STATUS[order.status]
    if (!next) throw new Error(`Order cannot advance from status "${order.status}"`)
    await recordStatusChange(order, { status: next, at: Date.now(), by: actor.id, note }, actor)
    return next
  },

  async setStatus(order: Order, status: OrderStatus, actor: Actor, note?: string) {
    await recordStatusChange(order, { status, at: Date.now(), by: actor.id, note }, actor)
  },

  /**
   * Merchant confirms cash was collected. Per the platform workflow this
   * automatically completes the order.
   */
  async markCashReceived(order: Order, actor: Actor) {
    if (order.status !== 'delivered') throw new Error('Cash can only be confirmed after delivery.')
    const now = Date.now()
    await updateDocument(COLLECTIONS.orders, order.id, {
      cashReceived: true,
      cashReceivedAt: now,
      status: 'completed',
      timeline: arrayUnion(
        { status: 'cash_received', at: now, by: actor.id, note: 'Cash payment confirmed by merchant' },
        { status: 'completed', at: now, by: actor.id, note: 'Order completed automatically' },
      ),
    })
    await activityService.log(actor, 'order.cash_received', 'order', order.id, order.orderNumber)
    await notificationsService.notify(order.customerId, {
      type: 'order_update',
      title: `Order ${order.orderNumber} completed`,
      body: 'Payment received — thank you for shopping with us!',
      linkUrl: `/account/orders/${order.id}`,
    })
  },

  /** Customer cancels a still-pending order; stock is restored */
  async cancel(order: Order, actor: Actor, reason: string) {
    if (!['pending', 'confirmed'].includes(order.status)) {
      throw new Error('Only pending or confirmed orders can be cancelled.')
    }
    await recordStatusChange(
      order,
      { status: 'cancelled', at: Date.now(), by: actor.id, note: reason },
      actor,
      { cancelReason: reason },
    )
    await Promise.allSettled(
      order.items.map((item) =>
        updateDocument(COLLECTIONS.products, item.productId, {
          stock: increment(item.quantity),
          soldCount: increment(-item.quantity),
        }),
      ),
    )
    await notificationsService.notify(order.merchantId, {
      type: 'order_update',
      title: `Order ${order.orderNumber} cancelled`,
      body: reason,
      linkUrl: `/merchant/orders/${order.id}`,
    })
  },

  async requestReturn(order: Order, actor: Actor, reason: string) {
    if (!['delivered', 'completed'].includes(order.status)) {
      throw new Error('Returns can only be requested after delivery.')
    }
    await recordStatusChange(
      order,
      { status: 'refund_requested', at: Date.now(), by: actor.id, note: reason },
      actor,
      { returnReason: reason },
    )
  },

  /** Re-add all items of a past order to the given cart-merge callback */
  async reorderProducts(order: Order) {
    return productsService.getManyByIds(order.items.map((i) => i.productId))
  },
}
