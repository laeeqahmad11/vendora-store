import {
  limit,
  orderBy,
  where,
  type QueryConstraint,
} from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import {
  COLLECTIONS,
  NEXT_ORDER_STATUS,
} from '@/lib/constants'
import {
  getDocById,
  queryDocs,
} from '@/services/firestore'
import { productsService } from '@/services/products.service'
import { checkoutService } from '@/services/checkout.service'
import { functions } from '@/lib/firebase'
import type {
  Order,
  OrderStatus,
  UserRole,
} from '@/types'

interface Actor {
  id: string
  name: string
  role: UserRole
}

const transitionOrder = httpsCallable<
  { orderId: string; nextStatus: OrderStatus; note?: string },
  { orderId: string; status: OrderStatus }
>(functions, 'transitionOrder')

const confirmOrderCash = httpsCallable<
  { orderId: string },
  { orderId: string; status: 'completed'; cashReceived: true }
>(functions, 'confirmOrderCash')

const requestOrderRefund = httpsCallable<
  { orderId: string; reason: string },
  { orderId: string; status: 'refund_requested' }
>(functions, 'requestOrderRefund')

const decideOrderReturn = httpsCallable<
  { orderId: string; decision: 'approve' | 'decline' },
  { orderId: string; status: 'returned' | 'completed' }
>(functions, 'decideOrderReturn')

export const ordersService = {
  async getById(id: string) {
    return getDocById<Order>(COLLECTIONS.orders, id)
  },

  async listByCustomer(customerId: string) {
    return queryDocs<Order>(
      COLLECTIONS.orders,
      where('customerId', '==', customerId),
      orderBy('createdAt', 'desc'),
    )
  },

  async listByStore(storeId: string, status?: OrderStatus) {
    const constraints: QueryConstraint[] = [
      where('storeId', '==', storeId),
      orderBy('createdAt', 'desc'),
    ]

    if (status) {
      constraints.splice(1, 0, where('status', '==', status))
    }

    return queryDocs<Order>(COLLECTIONS.orders, ...constraints)
  },

  async listAll(count = 200) {
    return queryDocs<Order>(
      COLLECTIONS.orders,
      orderBy('createdAt', 'desc'),
      limit(count),
    )
  },

  /** Advances one exact step in the trusted merchant fulfillment workflow. */
  async advanceStatus(order: Order, _actor: Actor, note?: string) {
    const next = NEXT_ORDER_STATUS[order.status]
    if (!next) {
      throw new Error(`Order cannot advance from status "${order.status}"`)
    }

    await transitionOrder({
      orderId: order.id,
      nextStatus: next,
      ...(note?.trim() ? { note: note.trim() } : {}),
    })
    return next
  },

  async decideReturn(
    order: Order,
    _actor: Actor,
    decision: 'approve' | 'decline',
  ) {
    await decideOrderReturn({ orderId: order.id, decision })
  },

  /** Merchant confirms COD collection; the backend completes the order. */
  async markCashReceived(order: Order, _actor: Actor) {
    if (order.status !== 'delivered') {
      throw new Error('Cash can only be confirmed after delivery.')
    }
    await confirmOrderCash({ orderId: order.id })
  },

  /** Cancels through the existing inventory-restoring trusted transaction. */
  async cancel(order: Order, _actor: Actor, reason: string) {
    if (!['pending', 'confirmed'].includes(order.status)) {
      throw new Error('Only pending or confirmed orders can be cancelled.')
    }
    await checkoutService.cancelOrder(order.id, reason.trim() || 'Order cancelled')
  },

  async requestReturn(order: Order, _actor: Actor, reason: string) {
    if (!['delivered', 'completed'].includes(order.status)) {
      throw new Error('Returns can only be requested after delivery.')
    }

    await requestOrderRefund({
      orderId: order.id,
      reason: reason.trim() || 'Return requested',
    })
  },

  async reorderProducts(order: Order) {
    return productsService.getManyByIds(order.items.map((item) => item.productId))
  },
}
