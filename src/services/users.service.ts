import {
  collection,
  doc,
  getDocs,
  limit,
  orderBy,
  serverTimestamp,
  where,
  writeBatch,
  type QueryConstraint,
} from 'firebase/firestore'
import { COLLECTIONS } from '@/lib/constants'
import { db } from '@/lib/firebase'
import { stripUndefined } from '@/lib/utils'
import { getDocById, queryDocs, updateDocument } from '@/services/firestore'
import type { Address, UserProfile, UserRole } from '@/types'

const addressesPath = (uid: string) =>
  `${COLLECTIONS.users}/${uid}/addresses`

export const usersService = {
  async getById(id: string) {
    return getDocById<UserProfile>(COLLECTIONS.users, id)
  },

  async list(role?: UserRole, count = 200) {
    const constraints: QueryConstraint[] = [orderBy('createdAt', 'desc'), limit(count)]
    if (role) constraints.unshift(where('role', '==', role))
    return queryDocs<UserProfile>(COLLECTIONS.users, ...constraints)
  },

  async setRole(id: string, role: UserRole) {
    await updateDocument(COLLECTIONS.users, id, { role })
  },

  async setSuspended(id: string, suspended: boolean) {
    await updateDocument(COLLECTIONS.users, id, { suspended })
  },

  // Addresses live in a subcollection users/{uid}/addresses
  async listAddresses(uid: string) {
    return queryDocs<Address>(addressesPath(uid))
  },

  async addAddress(uid: string, data: Omit<Address, 'id'>) {
    const addressCollection = collection(db, addressesPath(uid))
    const existing = await getDocs(addressCollection)
    const addressRef = doc(addressCollection)
    const makeDefault = existing.empty || data.isDefault === true
    const batch = writeBatch(db)

    batch.set(addressRef, {
      ...stripUndefined(data as unknown as Record<string, unknown>),
      isDefault: makeDefault,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })

    if (makeDefault) {
      for (const snapshot of existing.docs) {
        if (snapshot.data().isDefault !== true) continue
        batch.update(snapshot.ref, {
          isDefault: false,
          updatedAt: serverTimestamp(),
        })
      }
    }

    await batch.commit()
    return addressRef.id
  },

  async updateAddress(uid: string, id: string, data: Partial<Address>) {
    const addressCollection = collection(db, addressesPath(uid))
    const existing = await getDocs(addressCollection)
    const target = existing.docs.find((snapshot) => snapshot.id === id)
    const others = existing.docs.filter((snapshot) => snapshot.id !== id)
    const batch = writeBatch(db)
    const update = stripUndefined(
      data as unknown as Record<string, unknown>,
    )

    if (data.isDefault === true) {
      for (const snapshot of others) {
        if (snapshot.data().isDefault !== true) continue
        batch.update(snapshot.ref, {
          isDefault: false,
          updatedAt: serverTimestamp(),
        })
      }
    } else if (data.isDefault === false && target?.data().isDefault === true) {
      const replacement = others[0]

      if (replacement) {
        batch.update(replacement.ref, {
          isDefault: true,
          updatedAt: serverTimestamp(),
        })
      } else {
        update.isDefault = true
      }
    }

    batch.update(doc(db, addressesPath(uid), id), {
      ...update,
      updatedAt: serverTimestamp(),
    })
    await batch.commit()
  },

  async deleteAddress(uid: string, id: string) {
    const addressCollection = collection(db, addressesPath(uid))
    const existing = await getDocs(addressCollection)
    const remaining = existing.docs.filter((snapshot) => snapshot.id !== id)
    const retainedDefault = remaining.find(
      (snapshot) => snapshot.data().isDefault === true,
    )
    const nextDefault = retainedDefault ?? remaining[0]
    const batch = writeBatch(db)

    batch.delete(doc(db, addressesPath(uid), id))

    for (const snapshot of remaining) {
      const shouldBeDefault = snapshot.id === nextDefault?.id
      if (snapshot.data().isDefault === shouldBeDefault) continue
      batch.update(snapshot.ref, {
        isDefault: shouldBeDefault,
        updatedAt: serverTimestamp(),
      })
    }

    await batch.commit()
  },
}
