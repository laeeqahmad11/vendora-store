import dayjs from 'dayjs'
import type { Order } from '@/types'

export const chartTooltipStyle = {
  background: 'var(--card)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  fontSize: 12,
  color: 'var(--foreground)',
} as const

export const PIE_COLORS = [
  'var(--primary)',
  'var(--success)',
  'var(--warning)',
  'var(--destructive)',
  'oklch(0.6 0.15 220)',
  'oklch(0.65 0.15 320)',
  'oklch(0.55 0.1 180)',
  'oklch(0.7 0.12 40)',
] as const

export interface DayPoint {
  day: string
  label: string
  revenue: number
  orders: number
}

/** Buckets orders into the last `days` days. Revenue counts completed orders only. */
export function bucketOrdersByDay(orders: Order[], days: number): DayPoint[] {
  const buckets = new Map<string, DayPoint>()
  for (let i = days - 1; i >= 0; i--) {
    const d = dayjs().subtract(i, 'day')
    buckets.set(d.format('YYYY-MM-DD'), {
      day: d.format('YYYY-MM-DD'),
      label: d.format('MMM D'),
      revenue: 0,
      orders: 0,
    })
  }
  for (const order of orders) {
    const bucket = buckets.get(dayjs(order.createdAt).format('YYYY-MM-DD'))
    if (!bucket) continue
    bucket.orders += 1
    if (order.status === 'completed') bucket.revenue = Math.round((bucket.revenue + order.total) * 100) / 100
  }
  return [...buckets.values()]
}

export interface MerchantStat {
  storeId: string
  storeName: string
  orders: number
  revenue: number
}

/** Aggregates revenue (completed orders) and order counts per store. */
export function topMerchants(orders: Order[], count = 5): MerchantStat[] {
  const map = new Map<string, MerchantStat>()
  for (const order of orders) {
    const entry = map.get(order.storeId) ?? {
      storeId: order.storeId,
      storeName: order.storeName,
      orders: 0,
      revenue: 0,
    }
    entry.orders += 1
    if (order.status === 'completed') entry.revenue += order.total
    map.set(order.storeId, entry)
  }
  return [...map.values()].sort((a, b) => b.revenue - a.revenue).slice(0, count)
}
