import type { Product } from '@/types'

export type StockTab = 'all' | 'low' | 'out'

export type AdjustReason = 'restock' | 'adjustment' | 'return'

export interface StockAdjustment {
  product: Product
  variantId?: string
  change: number
  reason: AdjustReason
  note: string
}
