import { orderBy, where, limit, type QueryConstraint } from 'firebase/firestore'
import { COLLECTIONS } from '@/lib/constants'
import { createDocument, getDocById, queryDocs, updateDocument, deleteDocument } from '@/services/firestore'
import { activityService } from '@/services/activity.service'
import { notificationsService } from '@/services/notifications.service'
import { slugify } from '@/lib/utils'
import type { Store, StoreStatus, UserRole } from '@/types'

interface Actor {
  id: string
  name: string
  role: UserRole
}

export const storesService = {
  async getById(id: string) {
    return getDocById<Store>(COLLECTIONS.stores, id)
  },

  async getBySlug(slug: string) {
    const items = await queryDocs<Store>(COLLECTIONS.stores, where('slug', '==', slug), limit(1))
    return items[0] ?? null
  },

  async getByOwner(ownerId: string) {
    const items = await queryDocs<Store>(COLLECTIONS.stores, where('ownerId', '==', ownerId), limit(1))
    return items[0] ?? null
  },

  async listApproved(count = 50) {
    return queryDocs<Store>(COLLECTIONS.stores, where('status', '==', 'approved'), limit(count))
  },

  async listAll(status?: StoreStatus) {
    const constraints: QueryConstraint[] = [orderBy('createdAt', 'desc')]
    if (status) constraints.unshift(where('status', '==', status))
    return queryDocs<Store>(COLLECTIONS.stores, ...constraints)
  },

  /** Merchant application — creates a pending store */
  async apply(
    data: Pick<Store, 'name' | 'description' | 'email' | 'phone' | 'businessName' | 'address' | 'businessDocumentUrl' | 'logoUrl'>,
    actor: Actor,
  ) {
    const id = await createDocument<Store>(COLLECTIONS.stores, {
      ...data,
      ownerId: actor.id,
      slug: `${slugify(data.name)}-${Math.random().toString(36).slice(2, 6)}`,
      status: 'pending',
      verified: false,
      rating: 0,
      ratingCount: 0,
      productCount: 0,
      totalSales: 0,
    } as Omit<Store, 'id' | 'createdAt' | 'updatedAt'>)
    await activityService.log(actor, 'store.applied', 'store', id, data.name)
    return id
  },

  async update(id: string, data: Partial<Store>) {
    await updateDocument(COLLECTIONS.stores, id, data)
  },

  /** Admin decision. On approval the owner's role is elevated to merchant. */
  async setStatus(store: Store, status: StoreStatus, actor: Actor, reason?: string) {
    await updateDocument(COLLECTIONS.stores, store.id, { status, rejectionReason: reason ?? '' })
    if (status === 'approved') {
      await updateDocument(COLLECTIONS.users, store.ownerId, { role: 'merchant', storeId: store.id })
    }
    await activityService.log(actor, `store.${status}`, 'store', store.id, store.name)
    await notificationsService.notify(store.ownerId, {
      type: 'approval',
      title: `Store ${status}`,
      body:
        status === 'approved'
          ? `Congratulations! "${store.name}" is now live. You can start listing products.`
          : `Your store "${store.name}" was ${status}.${reason ? ` Reason: ${reason}` : ''}`,
      linkUrl: '/merchant',
    })
  },

  async remove(id: string) {
    await deleteDocument(COLLECTIONS.stores, id)
  },
}
