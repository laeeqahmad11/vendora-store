import { arrayUnion, orderBy, where } from 'firebase/firestore'
import { COLLECTIONS } from '@/lib/constants'
import { createDocument, queryDocs, updateDocument } from '@/services/firestore'
import type { SupportTicket } from '@/types'

export const supportService = {
  async listByCustomer(customerId: string) {
    return queryDocs<SupportTicket>(
      COLLECTIONS.supportTickets,
      where('customerId', '==', customerId),
      orderBy('createdAt', 'desc'),
    )
  },

  async listAll() {
    return queryDocs<SupportTicket>(COLLECTIONS.supportTickets, orderBy('updatedAt', 'desc'))
  },

  async create(data: Omit<SupportTicket, 'id' | 'createdAt' | 'updatedAt' | 'status' | 'messages'> & { message: string }) {
    const { message, ...rest } = data
    return createDocument<SupportTicket>(COLLECTIONS.supportTickets, {
      ...rest,
      status: 'open',
      messages: [{ senderId: data.customerId, senderName: data.customerName, text: message, at: Date.now() }],
    } as Omit<SupportTicket, 'id' | 'createdAt' | 'updatedAt'>)
  },

  async addMessage(id: string, senderId: string, senderName: string, text: string) {
    await updateDocument(COLLECTIONS.supportTickets, id, {
      messages: arrayUnion({ senderId, senderName, text, at: Date.now() }),
    })
  },

  async setStatus(id: string, status: SupportTicket['status']) {
    await updateDocument(COLLECTIONS.supportTickets, id, { status })
  },
}
