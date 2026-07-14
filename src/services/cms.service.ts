import { orderBy, where, limit, type QueryConstraint } from 'firebase/firestore'
import { COLLECTIONS } from '@/lib/constants'
import {
  createDocument,
  deleteDocument,
  getDocById,
  queryDocs,
  updateDocument,
} from '@/services/firestore'
import { slugify } from '@/lib/utils'
import type { Banner, BlogPost, FAQ, PlatformSettings, StaticPage } from '@/types'

export const cmsService = {
  // ----------------------------------------------------------------- blogs
  async listBlogs(publishedOnly = true) {
    const constraints: QueryConstraint[] = [orderBy('createdAt', 'desc'), limit(50)]
    if (publishedOnly) constraints.unshift(where('published', '==', true))
    return queryDocs<BlogPost>(COLLECTIONS.blogs, ...constraints)
  },

  async getBlogBySlug(slug: string) {
    const items = await queryDocs<BlogPost>(COLLECTIONS.blogs, where('slug', '==', slug), limit(1))
    return items[0] ?? null
  },

  async createBlog(data: Omit<BlogPost, 'id' | 'createdAt' | 'slug'>) {
    return createDocument<BlogPost>(COLLECTIONS.blogs, {
      ...data,
      slug: slugify(data.title),
    } as Omit<BlogPost, 'id' | 'createdAt' | 'updatedAt'>)
  },

  async updateBlog(id: string, data: Partial<BlogPost>) {
    await updateDocument(COLLECTIONS.blogs, id, data)
  },

  async deleteBlog(id: string) {
    await deleteDocument(COLLECTIONS.blogs, id)
  },

  // ------------------------------------------------------------------ faqs
  async listFAQs() {
    return queryDocs<FAQ>(COLLECTIONS.faqs, orderBy('sortOrder', 'asc'))
  },

  async createFAQ(data: Omit<FAQ, 'id'>) {
    return createDocument<FAQ>(COLLECTIONS.faqs, data as Omit<FAQ, 'id'>)
  },

  async updateFAQ(id: string, data: Partial<FAQ>) {
    await updateDocument(COLLECTIONS.faqs, id, data)
  },

  async deleteFAQ(id: string) {
    await deleteDocument(COLLECTIONS.faqs, id)
  },

  // ----------------------------------------------------------- static pages
  async getPage(id: string) {
    return getDocById<StaticPage>(COLLECTIONS.pages, id)
  },

  async savePage(id: string, data: Pick<StaticPage, 'title' | 'content'>) {
    // setDoc-style upsert via create (id fixed) or update
    const existing = await getDocById<StaticPage>(COLLECTIONS.pages, id)
    if (existing) await updateDocument(COLLECTIONS.pages, id, data)
    else await createDocument<StaticPage>(COLLECTIONS.pages, data as Omit<StaticPage, 'id' | 'updatedAt'>, id)
  },

  // --------------------------------------------------------------- banners
  async listBanners(activeOnly = false) {
    const items = await queryDocs<Banner>(COLLECTIONS.banners, orderBy('sortOrder', 'asc'))
    return activeOnly ? items.filter((b) => b.active) : items
  },

  async createBanner(data: Omit<Banner, 'id' | 'createdAt'>) {
    return createDocument<Banner>(COLLECTIONS.banners, data as Omit<Banner, 'id' | 'createdAt' | 'updatedAt'>)
  },

  async updateBanner(id: string, data: Partial<Banner>) {
    await updateDocument(COLLECTIONS.banners, id, data)
  },

  async deleteBanner(id: string) {
    await deleteDocument(COLLECTIONS.banners, id)
  },

  // -------------------------------------------------------------- settings
  async getPlatformSettings(): Promise<PlatformSettings | null> {
    return getDocById<PlatformSettings>(COLLECTIONS.settings, 'platform')
  },

  async savePlatformSettings(data: Partial<PlatformSettings>) {
    const existing = await this.getPlatformSettings()
    if (existing) await updateDocument(COLLECTIONS.settings, 'platform', data)
    else
      await createDocument<PlatformSettings>(
        COLLECTIONS.settings,
        { name: 'Vendora', currency: 'USD', ...data } as Omit<PlatformSettings, 'id' | 'updatedAt'>,
        'platform',
      )
  },

  // ------------------------------------------------------------ newsletter
  async subscribeNewsletter(email: string) {
    await createDocument(COLLECTIONS.newsletter, { email: email.toLowerCase().trim() })
  },
}
