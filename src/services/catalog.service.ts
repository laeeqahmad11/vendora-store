import { orderBy, where } from 'firebase/firestore'
import { COLLECTIONS } from '@/lib/constants'
import { createDocument, deleteDocument, getDocById, queryDocs, updateDocument } from '@/services/firestore'
import { slugify } from '@/lib/utils'
import type { Brand, Category, Collection } from '@/types'

/** Categories, subcategories, brands and collections (global taxonomy). */
export const catalogService = {
  // ------------------------------------------------------------ categories
  async listCategories() {
    return queryDocs<Category>(COLLECTIONS.categories, orderBy('sortOrder', 'asc'))
  },

  async listTopCategories() {
    const all = await this.listCategories()
    return all.filter((c) => !c.parentId)
  },

  async listSubcategories(parentId: string) {
    return queryDocs<Category>(COLLECTIONS.categories, where('parentId', '==', parentId))
  },

  async getCategory(id: string) {
    return getDocById<Category>(COLLECTIONS.categories, id)
  },

  async getCategoryBySlug(slug: string) {
    const items = await queryDocs<Category>(COLLECTIONS.categories, where('slug', '==', slug))
    return items[0] ?? null
  },

  async createCategory(data: Pick<Category, 'name' | 'imageUrl' | 'parentId' | 'description' | 'featured' | 'sortOrder'>) {
    return createDocument<Category>(COLLECTIONS.categories, {
      ...data,
      slug: slugify(data.name),
      productCount: 0,
    } as Omit<Category, 'id' | 'createdAt' | 'updatedAt'>)
  },

  async updateCategory(id: string, data: Partial<Category>) {
    await updateDocument(COLLECTIONS.categories, id, data)
  },

  async deleteCategory(id: string) {
    await deleteDocument(COLLECTIONS.categories, id)
  },

  // ---------------------------------------------------------------- brands
  async listBrands() {
    return queryDocs<Brand>(COLLECTIONS.brands, orderBy('name', 'asc'))
  },

  async createBrand(data: Pick<Brand, 'name' | 'logoUrl' | 'featured'>) {
    return createDocument<Brand>(COLLECTIONS.brands, {
      ...data,
      slug: slugify(data.name),
    } as Omit<Brand, 'id' | 'createdAt' | 'updatedAt'>)
  },

  async updateBrand(id: string, data: Partial<Brand>) {
    await updateDocument(COLLECTIONS.brands, id, data)
  },

  async deleteBrand(id: string) {
    await deleteDocument(COLLECTIONS.brands, id)
  },

  // ------------------------------------------------------------ collections
  async listCollections(storeId?: string) {
    if (storeId) return queryDocs<Collection>(COLLECTIONS.collections, where('storeId', '==', storeId))
    return queryDocs<Collection>(COLLECTIONS.collections, orderBy('createdAt', 'desc'))
  },

  async createCollection(data: Pick<Collection, 'name' | 'description' | 'imageUrl' | 'storeId' | 'productIds'>) {
    return createDocument<Collection>(COLLECTIONS.collections, {
      ...data,
      slug: slugify(data.name),
    } as Omit<Collection, 'id' | 'createdAt' | 'updatedAt'>)
  },

  async updateCollection(id: string, data: Partial<Collection>) {
    await updateDocument(COLLECTIONS.collections, id, data)
  },

  async deleteCollection(id: string) {
    await deleteDocument(COLLECTIONS.collections, id)
  },
}
