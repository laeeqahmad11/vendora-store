import type { OrderStatus, ProductStatus, StoreStatus } from '@/types'

export const APP_NAME = 'Vendora'
export const APP_TAGLINE = 'The multi-vendor marketplace for modern brands'

/** Firestore collection names — single source of truth */
export const COLLECTIONS = {
  users: 'users',
  stores: 'stores',
  products: 'products',
  categories: 'categories',
  brands: 'brands',
  collections: 'collections',
  orders: 'orders',
  carts: 'carts',
  wishlists: 'wishlists',
  reviews: 'reviews',
  notifications: 'notifications',
  coupons: 'coupons',
  promotions: 'promotions',
  blogs: 'blogs',
  banners: 'banners',
  supportTickets: 'supportTickets',
  activityLogs: 'activityLogs',
  inventoryLogs: 'inventoryLogs',
  settings: 'settings',
  faqs: 'faqs',
  pages: 'pages',
  newsletter: 'newsletter',
  messages: 'messages',
} as const

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  packed: 'Packed',
  ready: 'Ready',
  dispatched: 'Dispatched',
  delivered: 'Delivered',
  completed: 'Completed',
  cancelled: 'Cancelled',
  returned: 'Returned',
  refund_requested: 'Refund Requested',
}

export const ORDER_STATUS_COLORS: Record<OrderStatus, string> = {
  pending: 'bg-warning/15 text-warning',
  confirmed: 'bg-primary/15 text-primary',
  packed: 'bg-primary/15 text-primary',
  ready: 'bg-primary/15 text-primary',
  dispatched: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
  delivered: 'bg-success/15 text-success',
  completed: 'bg-success/20 text-success',
  cancelled: 'bg-destructive/15 text-destructive',
  returned: 'bg-destructive/15 text-destructive',
  refund_requested: 'bg-orange-500/15 text-orange-600 dark:text-orange-400',
}

/** Merchant-driven forward transitions. cash received → completed is automatic. */
export const NEXT_ORDER_STATUS: Partial<Record<OrderStatus, OrderStatus>> = {
  pending: 'confirmed',
  confirmed: 'packed',
  packed: 'ready',
  ready: 'dispatched',
  dispatched: 'delivered',
}

export const PRODUCT_STATUS_LABELS: Record<ProductStatus, string> = {
  draft: 'Draft',
  pending: 'Pending Review',
  approved: 'Approved',
  rejected: 'Rejected',
  archived: 'Archived',
}

export const PRODUCT_STATUS_COLORS: Record<ProductStatus, string> = {
  draft: 'bg-muted text-muted-foreground',
  pending: 'bg-warning/15 text-warning',
  approved: 'bg-success/15 text-success',
  rejected: 'bg-destructive/15 text-destructive',
  archived: 'bg-muted text-muted-foreground',
}

export const STORE_STATUS_LABELS: Record<StoreStatus, string> = {
  pending: 'Pending Approval',
  approved: 'Approved',
  rejected: 'Rejected',
  suspended: 'Suspended',
}

export const STORE_STATUS_COLORS: Record<StoreStatus, string> = {
  pending: 'bg-warning/15 text-warning',
  approved: 'bg-success/15 text-success',
  rejected: 'bg-destructive/15 text-destructive',
  suspended: 'bg-destructive/15 text-destructive',
}

export const PAGE_SIZE = 12
export const DASHBOARD_PAGE_SIZE = 20

export const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest' },
  { value: 'best_selling', label: 'Best Selling' },
  { value: 'popularity', label: 'Popularity' },
  { value: 'price_asc', label: 'Price: Low to High' },
  { value: 'price_desc', label: 'Price: High to Low' },
  { value: 'rating', label: 'Highest Rated' },
  { value: 'alphabetical', label: 'A – Z' },
] as const

export type SortOption = (typeof SORT_OPTIONS)[number]['value']
