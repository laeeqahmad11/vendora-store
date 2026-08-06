import type { OrderStatus } from '@/types'
import type { OrderTabItem } from './orders.types'

export const ORDER_TABS: OrderTabItem[] = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'packed', label: 'Packed' },
  { value: 'ready', label: 'Ready' },
  { value: 'dispatched', label: 'Dispatched' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'completed', label: 'Completed' },
  {
    value: 'refund_requested',
    label: 'Refunds',
  },
  { value: 'cancelled', label: 'Cancelled' },
]

export const IN_PROGRESS_ORDER_STATUSES: OrderStatus[] = [
  'confirmed',
  'packed',
  'ready',
  'dispatched',
  'delivered',
]
