/**
 * Domain model for the Vendora multi-vendor marketplace.
 * All Firestore documents are typed here; timestamps are stored as
 * Firestore Timestamps and surfaced as epoch milliseconds (number) in the app
 * via the service layer's converters.
 */

export type UserRole = 'admin' | 'merchant' | 'customer'

export interface UserProfile {
  id: string
  email: string
  displayName: string
  photoURL?: string
  phone?: string
  role: UserRole
  storeId?: string // set once a merchant application is approved
  suspended?: boolean
  emailVerified?: boolean
  createdAt: number
  updatedAt: number
}

export interface Address {
  id: string
  label: string // "Home", "Office"
  fullName: string
  phone: string
  line1: string
  line2?: string
  city: string
  province: string
  postalCode: string
  country: string
  isDefault?: boolean
}

// ---------------------------------------------------------------- Stores

export type StoreStatus = 'pending' | 'approved' | 'rejected' | 'suspended'

export interface Store {
  id: string
  ownerId: string
  name: string
  slug: string
  description: string
  logoUrl?: string
  bannerUrl?: string
  email: string
  phone: string
  address?: string
  businessName?: string
  businessDocumentUrl?: string
  socialLinks?: { facebook?: string; instagram?: string; twitter?: string; website?: string }
  status: StoreStatus
  rejectionReason?: string
  verified?: boolean
  rating: number
  ratingCount: number
  productCount: number
  totalSales: number
  seo?: { title?: string; description?: string }
  businessHours?: string
  shippingPolicy?: string
  createdAt: number
  updatedAt: number
}

// -------------------------------------------------------------- Catalog

export interface Category {
  id: string
  name: string
  slug: string
  imageUrl?: string
  parentId?: string | null // null = top-level; set = subcategory
  description?: string
  featured?: boolean
  sortOrder?: number
  productCount?: number
  createdAt: number
}

export interface Brand {
  id: string
  name: string
  slug: string
  logoUrl?: string
  featured?: boolean
  createdAt: number
}

export interface Collection {
  id: string
  name: string
  slug: string
  description?: string
  imageUrl?: string
  storeId?: string // absent = global (admin-managed) collection
  productIds: string[]
  createdAt: number
}

export type ProductStatus = 'draft' | 'pending' | 'approved' | 'rejected' | 'archived'

export interface ProductVariant {
  id: string
  /** e.g. { Color: "Red", Size: "M" } */
  options: Record<string, string>
  sku?: string
  barcode?: string
  price?: number // overrides product price when set
  stock: number
  imageUrl?: string
}

export interface Product {
  id: string
  storeId: string
  merchantId: string
  name: string
  slug: string
  description: string
  images: string[]
  videoUrl?: string
  price: number
  compareAtPrice?: number | null
  currency: string
  sku?: string
  barcode?: string
  stock: number
  lowStockThreshold?: number
  minOrderQty?: number
  maxOrderQty?: number
  categoryId: string
  subcategoryId?: string
  brandId?: string
  tags: string[]
  collectionIds?: string[]
  /** option name -> allowed values, e.g. { Color: ["Red","Blue"] } */
  variantOptions?: Record<string, string[]>
  variants?: ProductVariant[]
  specifications?: { label: string; value: string }[]
  weight?: string
  dimensions?: string
  warranty?: string
  returnPolicy?: string
  shippingInfo?: string
  relatedProductIds?: string[]
  status: ProductStatus
  rejectionReason?: string
  featured?: boolean
  trending?: boolean
  recommended?: boolean
  flashSale?: { active: boolean; endsAt: number; salePrice: number } | null
  rating: number
  ratingCount: number
  soldCount: number
  viewCount: number
  seo?: { title?: string; description?: string }
  createdAt: number
  updatedAt: number
  publishedAt?: number
}

// --------------------------------------------------------------- Orders

export type OrderStatus =
  | 'pending'
  | 'confirmed'
  | 'packed'
  | 'ready'
  | 'dispatched'
  | 'delivered'
  | 'completed' // set automatically when merchant marks cash received
  | 'cancelled'
  | 'returned'
  | 'refund_requested'

export const ORDER_STATUS_FLOW: OrderStatus[] = [
  'pending',
  'confirmed',
  'packed',
  'ready',
  'dispatched',
  'delivered',
  'completed',
]

export interface OrderItem {
  productId: string
  name: string
  imageUrl?: string
  price: number
  quantity: number
  variant?: Record<string, string>
  variantId?: string
  sku?: string
}

export interface OrderTimelineEntry {
  status: OrderStatus | 'cash_received'
  at: number
  by: string // uid
  note?: string
}

export interface Order {
  id: string
  orderNumber: string
  customerId: string
  customerName: string
  customerEmail: string
  customerPhone: string
  storeId: string
  merchantId: string
  storeName: string
  items: OrderItem[]
  subtotal: number
  discount: number
  couponCode?: string
  shippingFee: number
  tax: number
  total: number
  paymentMethod: 'cod'
  cashReceived: boolean
  cashReceivedAt?: number
  status: OrderStatus
  shippingAddress: Omit<Address, 'id' | 'label' | 'isDefault'>
  specialInstructions?: string
  giftNote?: string
  timeline: OrderTimelineEntry[]
  cancelReason?: string
  returnReason?: string
  createdAt: number
  updatedAt: number
}

// ------------------------------------------------------ Cart & wishlist

export interface CartItem {
  productId: string
  storeId: string
  storeName: string
  name: string
  imageUrl?: string
  price: number
  quantity: number
  stock: number
  maxOrderQty?: number
  variantId?: string
  variant?: Record<string, string>
  savedForLater?: boolean
}

// -------------------------------------------------------------- Reviews

export interface Review {
  id: string
  productId: string
  storeId: string
  customerId: string
  customerName: string
  orderId?: string // presence = verified purchase
  rating: number
  title?: string
  comment: string
  images?: string[]
  status: 'pending' | 'approved' | 'rejected' | 'hidden'
  reply?: { text: string; at: number }
  helpfulCount: number
  reported?: boolean
  createdAt: number
}

// ----------------------------------------------------------- Discounts

export type DiscountType = 'percentage' | 'fixed' | 'bogo' | 'first_order'

export interface Coupon {
  id: string
  storeId?: string // absent = platform-wide (admin)
  code: string
  type: DiscountType
  value: number // percent (0-100) or fixed amount
  minOrderAmount?: number
  maxDiscount?: number
  usageLimit?: number
  usedCount: number
  perCustomerLimit?: number
  startsAt?: number
  expiresAt?: number
  active: boolean
  appliesTo?: { categoryIds?: string[]; productIds?: string[] }
  createdAt: number
}

export interface Promotion {
  id: string
  storeId?: string // absent = global
  title: string
  subtitle?: string
  type: 'flash_sale' | 'festival' | 'clearance' | 'banner' | 'featured'
  imageUrl?: string
  linkUrl?: string
  productIds?: string[]
  discountPercent?: number
  startsAt: number
  endsAt: number
  active: boolean
  placement?: 'hero' | 'carousel' | 'strip'
  sortOrder?: number
  createdAt: number
}

// -------------------------------------------------------- Notifications

export type NotificationType =
  | 'order_update'
  | 'approval'
  | 'review'
  | 'discount'
  | 'announcement'
  | 'low_stock'
  | 'message'

export interface AppNotification {
  id: string
  userId: string
  type: NotificationType
  title: string
  body: string
  linkUrl?: string
  read: boolean
  createdAt: number
}

// ------------------------------------------------------------------ CMS

export interface BlogPost {
  id: string
  title: string
  slug: string
  excerpt: string
  content: string
  coverUrl?: string
  author: string
  tags: string[]
  published: boolean
  createdAt: number
}

export interface FAQ {
  id: string
  question: string
  answer: string
  category?: string
  sortOrder?: number
}

export interface StaticPage {
  id: string // 'about' | 'terms' | 'privacy' | 'shipping-policy' | 'return-policy' | 'contact'
  title: string
  content: string
  updatedAt: number
}

export interface Banner {
  id: string
  title: string
  subtitle?: string
  imageUrl: string
  linkUrl?: string
  placement: 'hero' | 'strip' | 'sidebar'
  active: boolean
  sortOrder: number
  createdAt: number
}

// ------------------------------------------------------------- Support

export interface SupportTicket {
  id: string
  customerId: string
  customerName: string
  customerEmail: string
  orderId?: string
  subject: string
  status: 'open' | 'in_progress' | 'resolved' | 'closed'
  priority: 'low' | 'medium' | 'high'
  messages: { senderId: string; senderName: string; text: string; at: number }[]
  createdAt: number
  updatedAt: number
}

// ------------------------------------------------------------- Logging

export interface ActivityLog {
  id: string
  actorId: string
  actorName: string
  actorRole: UserRole
  action: string // e.g. "order.status_changed"
  targetType: string // "order" | "product" | "store" | ...
  targetId: string
  detail?: string
  createdAt: number
}

// ------------------------------------------------------------ Settings

export interface PlatformSettings {
  id: 'platform'
  name: string
  tagline?: string
  logoUrl?: string
  supportEmail?: string
  currency: string
  commissionPercent?: number
  announcement?: { text: string; active: boolean }
  seo?: { title?: string; description?: string }
  updatedAt: number
}

// --------------------------------------------------------------- Misc

export interface InventoryLog {
  id: string
  storeId: string
  productId: string
  productName: string
  change: number
  reason: 'sale' | 'restock' | 'adjustment' | 'return'
  note?: string
  by: string
  createdAt: number
}

export interface PaginatedResult<T> {
  items: T[]
  /** Opaque cursor for the next page; undefined when exhausted */
  cursor?: unknown
  hasMore: boolean
}
