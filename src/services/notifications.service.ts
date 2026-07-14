import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
  writeBatch,
  doc,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { COLLECTIONS } from '@/lib/constants'
import { createDocument, queryDocs, snapToDoc, updateDocument } from '@/services/firestore'
import type { AppNotification, NotificationType } from '@/types'

export const notificationsService = {
  /** Fire-and-forget — notification failures never break the primary action */
  async notify(
    userId: string,
    data: { type: NotificationType; title: string; body: string; linkUrl?: string },
  ) {
    try {
      await createDocument<AppNotification>(COLLECTIONS.notifications, {
        userId,
        ...data,
        read: false,
      } as Omit<AppNotification, 'id' | 'createdAt' | 'updatedAt'>)
    } catch {
      /* non-fatal */
    }
  },

  /** Real-time subscription to the user's latest notifications */
  subscribe(userId: string, callback: (items: AppNotification[]) => void) {
    const q = query(
      collection(db, COLLECTIONS.notifications),
      where('userId', '==', userId),
      orderBy('createdAt', 'desc'),
      limit(30),
    )
    return onSnapshot(q, (snap) => callback(snap.docs.map((d) => snapToDoc<AppNotification>(d))), () => {})
  },

  async list(userId: string) {
    return queryDocs<AppNotification>(
      COLLECTIONS.notifications,
      where('userId', '==', userId),
      orderBy('createdAt', 'desc'),
      limit(50),
    )
  },

  async markRead(id: string) {
    await updateDocument(COLLECTIONS.notifications, id, { read: true })
  },

  async markAllRead(ids: string[]) {
    const batch = writeBatch(db)
    ids.forEach((id) => batch.update(doc(db, COLLECTIONS.notifications, id), { read: true }))
    await batch.commit()
  },
}
