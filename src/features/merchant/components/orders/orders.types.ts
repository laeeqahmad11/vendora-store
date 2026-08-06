import type { OrderStatus } from '@/types'

export type OrdersTab = OrderStatus | 'all'

export interface OrderTabItem {
  value: OrdersTab
  label: string
}

export type OrderStatusCounts = Partial<
  Record<OrderStatus, number>
>

export interface OrderSummaryCounts {
  pending: number
  inProgress: number
  completed: number
  cancelled: number
}
