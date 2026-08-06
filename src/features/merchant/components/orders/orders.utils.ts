import type {
  Order,
  OrderStatus,
} from '@/types'
import type {
  OrdersTab,
  OrderStatusCounts,
} from './orders.types'

export function getItemCount(order: Order) {
  return order.items.reduce(
    (sum, item) => sum + item.quantity,
    0,
  )
}

export function getStatusCounts(
  orders: Order[],
): OrderStatusCounts {
  const counts: OrderStatusCounts = {}

  for (const order of orders) {
    counts[order.status] =
      (counts[order.status] ?? 0) + 1
  }

  return counts
}

export function getStatusesCount(
  statusCounts: OrderStatusCounts,
  statuses: OrderStatus[],
) {
  return statuses.reduce(
    (total, status) =>
      total + (statusCounts[status] ?? 0),
    0,
  )
}

export function filterOrders(
  orders: Order[],
  tab: OrdersTab,
  search: string,
) {
  let items =
    tab === 'all'
      ? orders
      : orders.filter(
          (order) => order.status === tab,
        )

  const query = search.trim().toLowerCase()

  if (query) {
    items = items.filter((order) => {
      const searchableValues = [
        order.orderNumber,
        order.customerName,
        order.customerPhone,
        order.customerEmail,
      ]

      return searchableValues.some((value) =>
        value?.toLowerCase().includes(query),
      )
    })
  }

  return items
}

export function getCustomerInitial(
  customerName: string,
) {
  return (
    customerName
      ?.trim()
      .charAt(0)
      .toUpperCase() || '?'
  )
}

export function getCodPaymentLabel(
  cashReceived: boolean,
) {
  return cashReceived ? 'COD Received' : 'COD Due'
}
