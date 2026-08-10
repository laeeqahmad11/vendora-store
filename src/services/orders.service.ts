import {
  arrayUnion,
  limit,
  orderBy,
  where,
  type QueryConstraint,
} from 'firebase/firestore'
import {
  COLLECTIONS,
  NEXT_ORDER_STATUS,
} from '@/lib/constants'
import {
  getDocById,
  queryDocs,
  updateDocument,
} from '@/services/firestore'
import { activityService } from '@/services/activity.service'
import { notificationsService } from '@/services/notifications.service'
import { productsService } from '@/services/products.service'
import { checkoutService } from '@/services/checkout.service'
import type {
  Order,
  OrderStatus,
  OrderTimelineEntry,
  UserRole,
} from '@/types'

interface Actor {
  id: string
  name: string
  role: UserRole
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
    _actor: Actor,
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

    await checkoutService.cancelOrder(
      order.id,
      reason.trim() || 'Order cancelled',
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
