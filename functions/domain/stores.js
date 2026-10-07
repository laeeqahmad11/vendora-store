export const PUBLIC_STORE_FIELDS = Object.freeze([
  'ownerId',
  'name',
  'slug',
  'description',
  'logoUrl',
  'bannerUrl',
  'socialLinks',
  'status',
  'verified',
  'rating',
  'ratingCount',
  'productCount',
  'totalSales',
  'seo',
  'businessHours',
  'shippingPolicy',
  'shippingEnabled',
  'shippingFee',
  'freeShippingThreshold',
  'estimatedDeliveryDays',
  'createdAt',
  'updatedAt',
])

export const PRIVATE_MERCHANT_APPLICATION_FIELDS = Object.freeze([
  'email',
  'phone',
  'address',
  'businessName',
  'businessDocumentUrl',
  'rejectionReason',
])

// Merchant-editable fields exposed by the narrow trusted store-profile
// capability. Moderation, ownership, counters, identity, and timestamps are
// intentionally absent.
export const MERCHANT_STORE_PROFILE_FIELDS = Object.freeze([
  'name',
  'description',
  'logoUrl',
  'bannerUrl',
  'socialLinks',
  'seo',
  'businessHours',
  'shippingPolicy',
  'shippingEnabled',
  'shippingFee',
  'freeShippingThreshold',
  'estimatedDeliveryDays',
])

/** Build the public store document from the established, explicit allowlist. */
export function publicStoreProjection(store) {
  return Object.fromEntries(
    PUBLIC_STORE_FIELDS.filter((field) => store[field] !== undefined).map((field) => [field, store[field]]),
  )
}

/** Derive the queryable publication bit from authoritative moderation state. */
export function productPubliclyVisible(product, store) {
  return product?.status === 'approved' && store?.status === 'approved'
}
