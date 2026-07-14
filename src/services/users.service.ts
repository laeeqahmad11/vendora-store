import { orderBy, where, limit, type QueryConstraint } from 'firebase/firestore'
import { COLLECTIONS } from '@/lib/constants'
import { getDocById, queryDocs, updateDocument, createDocument, deleteDocument } from '@/services/firestore'
import type { Address, UserProfile, UserRole } from '@/types'

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
    return queryDocs<Address>(`${COLLECTIONS.users}/${uid}/addresses`)
  },

  async addAddress(uid: string, data: Omit<Address, 'id'>) {
    return createDocument<Address>(`${COLLECTIONS.users}/${uid}/addresses`, data as Omit<Address, 'id'>)
  },

  async updateAddress(uid: string, id: string, data: Partial<Address>) {
    await updateDocument(`${COLLECTIONS.users}/${uid}/addresses`, id, data)
  },

  async deleteAddress(uid: string, id: string) {
    await deleteDocument(`${COLLECTIONS.users}/${uid}/addresses`, id)
  },
}
