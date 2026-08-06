import * as React from 'react'
import { useNavigate } from 'react-router-dom'
import { orderBy, where } from 'firebase/firestore'
import { useRealtimeCollection } from '@/hooks/use-realtime'
import { COLLECTIONS } from '@/lib/constants'
import type { Order } from '@/types'
import { IN_PROGRESS_ORDER_STATUSES } from './orders.constants'
import type {
  OrdersTab,
  OrderSummaryCounts,
} from './orders.types'
import {
  filterOrders,
  getStatusesCount,
  getStatusCounts,
} from './orders.utils'

export function useOrders(storeId: string) {
  const navigate = useNavigate()

  const [tab, setTab] =
    React.useState<OrdersTab>('all')
  const [search, setSearch] =
    React.useState('')

  // Live subscription — new orders and status
  // changes appear without refreshing the page.
  const ordersQ =
    useRealtimeCollection<Order>(
      COLLECTIONS.orders,
      [
        where('storeId', '==', storeId),
        orderBy('createdAt', 'desc'),
      ],
      [storeId],
    )

  const orders = React.useMemo(
    () => ordersQ.data ?? [],
    [ordersQ.data],
  )

  const statusCounts = React.useMemo(
    () => getStatusCounts(orders),
    [orders],
  )

  const summaryCounts: OrderSummaryCounts = {
    pending: statusCounts.pending ?? 0,
    inProgress: getStatusesCount(
      statusCounts,
      IN_PROGRESS_ORDER_STATUSES,
    ),
    completed: statusCounts.completed ?? 0,
    cancelled: statusCounts.cancelled ?? 0,
  }

  const visible = React.useMemo(
    () => filterOrders(orders, tab, search),
    [orders, tab, search],
  )

  const getTabCount = (value: OrdersTab) => {
    if (value === 'all') {
      return orders.length
    }

    return statusCounts[value] ?? 0
  }

  const openOrder = (orderId: string) => {
    navigate(`/merchant/orders/${orderId}`)
  }

  const clearFilters = () => {
    setSearch('')
    setTab('all')
  }

  return {
    ordersQ,
    orders,
    tab,
    setTab,
    search,
    setSearch,
    statusCounts,
    summaryCounts,
    visible,
    getTabCount,
    openOrder,
    clearFilters,
  }
}
