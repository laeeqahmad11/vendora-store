import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  where,
  writeBatch,
  doc,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { COLLECTIONS } from '@/lib/constants'
import { queryDocs, snapToDoc, updateDocument } from '@/services/firestore'
import type { AppNotification } from '@/types'

export const notificationsService = {
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
    ids.forEach((id) => batch.update(doc(db, COLLECTIONS.notifications, id), {
      read: true,
      updatedAt: serverTimestamp(),
    }))
    await batch.commit()
  },
}
