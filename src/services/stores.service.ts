import {
  collection,
  doc,
  orderBy,
  serverTimestamp,
  where,
  limit,
  writeBatch,
  type QueryConstraint,
} from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { db, functions } from '@/lib/firebase'
import { COLLECTIONS } from '@/lib/constants'
import { getDocById, queryDocs, updateDocument } from '@/services/firestore'
import { activityService } from '@/services/activity.service'
import { notificationsService } from '@/services/notifications.service'
import { slugify } from '@/lib/utils'
import type { MerchantApplication, Store, StoreStatus, UserRole } from '@/types'

interface Actor {
  id: string
  name: string
  role: UserRole
}

const moderateStore = httpsCallable<
  { storeId: string; status: StoreStatus; reason?: string },
  { status: StoreStatus }
>(functions, 'moderateStore')

export const storesService = {
  async getById(id: string) {
    return getDocById<Store>(COLLECTIONS.stores, id)
  },

  async getBySlug(slug: string) {
    const items = await queryDocs<Store>(
      COLLECTIONS.publicStores,
      where('slug', '==', slug),
      where('status', '==', 'approved'),
      limit(1),
    )
    return items[0] ?? null
  },

  async getByOwner(ownerId: string) {
    const items = await queryDocs<Store>(COLLECTIONS.stores, where('ownerId', '==', ownerId), limit(1))
    return items[0] ?? null
  },

  async getApplication(storeId: string) {
    return getDocById<MerchantApplication>(COLLECTIONS.merchantApplications, storeId)
  },

  async listApproved(count = 50) {
    return queryDocs<Store>(COLLECTIONS.publicStores, where('status', '==', 'approved'), limit(count))
  },

  async listAll(status?: StoreStatus) {
    const constraints: QueryConstraint[] = [orderBy('createdAt', 'desc')]
    if (status) constraints.unshift(where('status', '==', status))
    return queryDocs<Store>(COLLECTIONS.stores, ...constraints)
  },

  /** Merchant application — creates a pending store */
  async apply(
    data: Pick<Store, 'name' | 'description' | 'logoUrl'> &
      Pick<MerchantApplication, 'email' | 'phone' | 'businessName' | 'address' | 'businessDocumentUrl'>,
    actor: Actor,
  ) {
    const storeRef = doc(collection(db, COLLECTIONS.stores))
    const applicationRef = doc(db, COLLECTIONS.merchantApplications, storeRef.id)
    const batch = writeBatch(db)
    batch.set(storeRef, {
      ownerId: actor.id,
      slug: `${slugify(data.name)}-${Math.random().toString(36).slice(2, 6)}`,
      name: data.name,
      description: data.description,
      ...(data.logoUrl ? { logoUrl: data.logoUrl } : {}),
      status: 'pending',
      verified: false,
      rating: 0,
      ratingCount: 0,
      productCount: 0,
      totalSales: 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
    batch.set(applicationRef, {
      storeId: storeRef.id,
      ownerId: actor.id,
      email: data.email,
      phone: data.phone,
      address: data.address,
      businessName: data.businessName,
      ...(data.businessDocumentUrl ? { businessDocumentUrl: data.businessDocumentUrl } : {}),
      status: 'pending',
      rejectionReason: '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
    await batch.commit()
    await activityService.log(actor, 'store.applied', 'store', storeRef.id, data.name)
    return storeRef.id
  },

  async resubmit(
    store: Store,
    data: Pick<Store, 'name' | 'description' | 'logoUrl'> &
      Pick<MerchantApplication, 'email' | 'phone' | 'businessName' | 'address' | 'businessDocumentUrl'>,
  ) {
    const batch = writeBatch(db)
    batch.update(doc(db, COLLECTIONS.stores, store.id), {
      name: data.name,
      description: data.description,
      ...(data.logoUrl ? { logoUrl: data.logoUrl } : {}),
      status: 'pending',
      updatedAt: serverTimestamp(),
    })
    batch.update(doc(db, COLLECTIONS.merchantApplications, store.id), {
      email: data.email,
      phone: data.phone,
      address: data.address,
      businessName: data.businessName,
      ...(data.businessDocumentUrl ? { businessDocumentUrl: data.businessDocumentUrl } : {}),
      status: 'pending',
      rejectionReason: '',
      updatedAt: serverTimestamp(),
    })
    await batch.commit()
  },

  async updateApplication(storeId: string, data: Partial<MerchantApplication>) {
    await updateDocument(COLLECTIONS.merchantApplications, storeId, data)
  },

  async update(id: string, data: Partial<Store>) {
    await updateDocument(COLLECTIONS.stores, id, data)
  },

  /** Trusted moderation preserves safe product/store transition ordering. */
  async setStatus(store: Store, status: StoreStatus, actor: Actor, reason?: string) {
    await moderateStore({ storeId: store.id, status, ...(reason ? { reason } : {}) })
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
    const batch = writeBatch(db)
    batch.delete(doc(db, COLLECTIONS.stores, id))
    batch.delete(doc(db, COLLECTIONS.merchantApplications, id))
    await batch.commit()
  },
}
