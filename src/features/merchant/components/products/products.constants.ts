import type { ProductTab } from './products.types'

export const PRODUCT_TAB_OPTIONS: {
  value: ProductTab
  label: string
}[] = [
  { value: 'all', label: 'All' },
  { value: 'draft', label: 'Drafts' },
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'archived', label: 'Archived' },
]

export const PRODUCT_CSV_EXPORT_COLUMNS = [
  'name',
  'description',
  'price',
  'stock',
  'categoryId',
  'sku',
  'status',
  'soldCount',
]

export const PRODUCT_CSV_REQUIRED_COLUMNS = ['name', 'price']
