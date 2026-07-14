import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  where,
  increment,
  type QueryConstraint,
  type QueryDocumentSnapshot,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { COLLECTIONS, PAGE_SIZE, type SortOption } from '@/lib/constants'
import {
  createDocument,
  deleteDocument,
  getDocById,
  queryDocs,
  snapToDoc,
  updateDocument,
} from '@/services/firestore'
import { slugify } from '@/lib/utils'
import type { PaginatedResult, Product, ProductStatus } from '@/types'

export interface ProductFilters {
  categoryId?: string
  subcategoryId?: string
  brandId?: string
  storeId?: string
  minPrice?: number
  maxPrice?: number
  minRating?: number
  inStockOnly?: boolean
  onSaleOnly?: boolean
  sort?: SortOption
}

function sortConstraints(sort: SortOption = 'newest'): QueryConstraint[] {
  switch (sort) {
    case 'best_selling':
      return [orderBy('soldCount', 'desc')]
    case 'popularity':
      return [orderBy('viewCount', 'desc')]
    case 'price_asc':
      return [orderBy('price', 'asc')]
    case 'price_desc':
      return [orderBy('price', 'desc')]
    case 'rating':
      return [orderBy('rating', 'desc')]
    case 'alphabetical':
      return [orderBy('name', 'asc')]
    default:
      return [orderBy('createdAt', 'desc')]
  }
}

export const productsService = {
  /**
   * Public catalog query (approved products only), cursor-paginated.
   * Price/rating/stock filters are applied client-side on the fetched page to
   * keep the composite-index surface small.
   */
  async listPublic(filters: ProductFilters = {}, cursor?: unknown, pageSize = PAGE_SIZE): Promise<PaginatedResult<Product>> {
    const constraints: QueryConstraint[] = [where('status', '==', 'approved')]
    if (filters.categoryId) constraints.push(where('categoryId', '==', filters.categoryId))
    if (filters.subcategoryId) constraints.push(where('subcategoryId', '==', filters.subcategoryId))
    if (filters.brandId) constraints.push(where('brandId', '==', filters.brandId))
    if (filters.storeId) constraints.push(where('storeId', '==', filters.storeId))
    constraints.push(...sortConstraints(filters.sort))
    if (cursor) constraints.push(startAfter(cursor as QueryDocumentSnapshot))
    constraints.push(limit(pageSize))

    const snap = await getDocs(query(collection(db, COLLECTIONS.products), ...constraints))
    let items = snap.docs.map((d) => snapToDoc<Product>(d))

    if (filters.minPrice != null) items = items.filter((p) => p.price >= filters.minPrice!)
    if (filters.maxPrice != null) items = items.filter((p) => p.price <= filters.maxPrice!)
    if (filters.minRating != null) items = items.filter((p) => p.rating >= filters.minRating!)
    if (filters.inStockOnly) items = items.filter((p) => p.stock > 0)
    if (filters.onSaleOnly) items = items.filter((p) => (p.compareAtPrice ?? 0) > p.price || p.flashSale?.active)

    return {
      items,
      cursor: snap.docs.at(-1),
      hasMore: snap.docs.length === pageSize,
    }
  },

  async getById(id: string) {
    return getDocById<Product>(COLLECTIONS.products, id)
  },

async getBySlug(slug: string) {
  const items = await queryDocs<Product>(
    COLLECTIONS.products,
    where("slug", "==", slug),
    where("status", "==", "approved"),
    limit(1)
  )

  return items[0] ?? null
},

  async getManyByIds(ids: string[]): Promise<Product[]> {
    if (!ids.length) return []
    // Firestore `in` supports max 30 values; chunk defensively
    const chunks: string[][] = []
    for (let i = 0; i < ids.length; i += 30) chunks.push(ids.slice(i, i + 30))
    const results = await Promise.all(
      chunks.map((chunk) => queryDocs<Product>(COLLECTIONS.products, where('__name__', 'in', chunk))),
    )
    return results.flat()
  },

  /** Featured / trending / flash-sale shelves for the homepage */
  async listShelf(field: 'featured' | 'trending' | 'recommended', count = 8) {
    return queryDocs<Product>(
      COLLECTIONS.products,
      where('status', '==', 'approved'),
      where(field, '==', true),
      limit(count),
    )
  },

  async listBestSellers(count = 8) {
    return queryDocs<Product>(
      COLLECTIONS.products,
      where('status', '==', 'approved'),
      orderBy('soldCount', 'desc'),
      limit(count),
    )
  },

  async listNewArrivals(count = 8) {
    return queryDocs<Product>(
      COLLECTIONS.products,
      where('status', '==', 'approved'),
      orderBy('createdAt', 'desc'),
      limit(count),
    )
  },

  async listFlashSale(count = 8) {
    const items = await queryDocs<Product>(
      COLLECTIONS.products,
      where('status', '==', 'approved'),
      where('flashSale.active', '==', true),
      limit(count),
    )
    return items.filter((p) => (p.flashSale?.endsAt ?? 0) > Date.now())
  },

  /** All approved products for client-side fuzzy search (Fuse.js) */
  async listForSearch(max = 400) {
    return queryDocs<Product>(COLLECTIONS.products, where('status', '==', 'approved'), limit(max))
  },

  // ----------------------------------------------------- merchant CRUD

  async listByStore(storeId: string, status?: ProductStatus) {
    const constraints: QueryConstraint[] = [where('storeId', '==', storeId), orderBy('createdAt', 'desc')]
    if (status) constraints.splice(1, 0, where('status', '==', status))
    return queryDocs<Product>(COLLECTIONS.products, ...constraints)
  },

  async create(data: Omit<Product, 'id' | 'createdAt' | 'updatedAt' | 'rating' | 'ratingCount' | 'soldCount' | 'viewCount' | 'slug'>) {
    const slug = `${slugify(data.name)}-${Math.random().toString(36).slice(2, 7)}`
    return createDocument<Product>(COLLECTIONS.products, {
      ...data,
      slug,
      rating: 0,
      ratingCount: 0,
      soldCount: 0,
      viewCount: 0,
    } as Omit<Product, 'id' | 'createdAt' | 'updatedAt'>)
  },

  async update(id: string, data: Partial<Product>) {
    await updateDocument(COLLECTIONS.products, id, data)
  },

  async remove(id: string) {
    await deleteDocument(COLLECTIONS.products, id)
  },

  /** Merchant re-submits for review; admin then approves/rejects */
  async submitForReview(id: string) {
    await updateDocument(COLLECTIONS.products, id, { status: 'pending', rejectionReason: '' })
  },

  async setStatus(id: string, status: ProductStatus, rejectionReason?: string) {
    await updateDocument(COLLECTIONS.products, id, {
      status,
      rejectionReason: rejectionReason ?? '',
      ...(status === 'approved' ? { publishedAt: Date.now() } : {}),
    })
  },

  async incrementView(id: string) {
    await updateDocument(COLLECTIONS.products, id, { viewCount: increment(1) }).catch(() => {})
  },

  // ------------------------------------------------------- admin queue

  async listPendingApproval() {
    return queryDocs<Product>(COLLECTIONS.products, where('status', '==', 'pending'), orderBy('updatedAt', 'asc'))
  },

  async adjustStock(id: string, change: number) {
    await updateDocument(COLLECTIONS.products, id, { stock: increment(change) })
  },
}
