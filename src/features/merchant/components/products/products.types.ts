import type { ProductStatus } from '@/types'

export type ProductTab = ProductStatus | 'all'

export interface ProductCounts {
  all: number
  draft: number
  pending: number
  approved: number
  rejected: number
  archived: number
  lowStock: number
}

export type ProductBulkAction = 'archive' | 'submit'
