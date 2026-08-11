import {
  arrayUnion,
  orderBy,
  where,
} from 'firebase/firestore'
import { COLLECTIONS } from '@/lib/constants'
import {
  createDocument,
  getDocById,
  queryDocs,
  updateDocument,
} from '@/services/firestore'
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
    return queryDocs<SupportTicket>(
      COLLECTIONS.supportTickets,
      orderBy('updatedAt', 'desc'),
    )
  },

  async create(
    data: Omit<
      SupportTicket,
      | 'id'
      | 'createdAt'
      | 'updatedAt'
      | 'status'
      | 'messages'
    > & {
      message: string
    },
  ) {
    const { message, ...rest } = data

    const ticketId =
      await createDocument<SupportTicket>(
        COLLECTIONS.supportTickets,
        {
          ...rest,
          status: 'open',
          messages: [
            {
              senderId: data.customerId,
              senderName: data.customerName,
              text: message,
              at: Date.now(),
            },
          ],
        } as Omit<
          SupportTicket,
          'id' | 'createdAt' | 'updatedAt'
        >,
      )

    return ticketId
  },

  async addMessage(
    id: string,
    senderId: string,
    senderName: string,
    text: string,
  ) {
    const ticket =
      await getDocById<SupportTicket>(
        COLLECTIONS.supportTickets,
        id,
      )

    if (!ticket) {
      throw new Error('Support ticket not found.')
    }

    await updateDocument(
      COLLECTIONS.supportTickets,
      id,
      {
        messages: arrayUnion({
          senderId,
          senderName,
          text,
          at: Date.now(),
        }),
      },
    )
  },

  async setStatus(
    id: string,
    status: SupportTicket['status'],
  ) {
    const ticket =
      await getDocById<SupportTicket>(
        COLLECTIONS.supportTickets,
        id,
      )

    if (!ticket) {
      throw new Error('Support ticket not found.')
    }

    if (ticket.status === status) return

    await updateDocument(
      COLLECTIONS.supportTickets,
      id,
      {
        status,
      },
    )
  },
}
