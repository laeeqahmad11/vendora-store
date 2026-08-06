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
import { notificationsService } from '@/services/notifications.service'
import type {
  NotificationType,
  SupportTicket,
} from '@/types'

const SUPPORT_NOTIFICATION_TYPE =
  'support' as NotificationType

const PLATFORM_SETTINGS_DOCUMENT = 'platform'

interface PlatformNotificationSettings {
  adminIds?: string[]
}

const STATUS_LABELS: Record<
  SupportTicket['status'],
  string
> = {
  open: 'Open',
  in_progress: 'In Progress',
  resolved: 'Resolved',
  closed: 'Closed',
}

/**
 * Reads admin notification recipients from:
 *
 * settings/platform
 *   adminIds: ["seed-admin-1"]
 *
 * This avoids querying the protected users collection
 * from a customer account.
 */
async function getAdminIds(): Promise<string[]> {
  try {
    const settings =
      await getDocById<PlatformNotificationSettings>(
        COLLECTIONS.settings,
        PLATFORM_SETTINGS_DOCUMENT,
      )

    if (!settings?.adminIds?.length) {
      return []
    }

    return [
      ...new Set(
        settings.adminIds.filter(
          (adminId): adminId is string =>
            typeof adminId === 'string' &&
            adminId.trim().length > 0,
        ),
      ),
    ]
  } catch {
    /*
     * Admin notifications must never prevent the main
     * support action from succeeding.
     */
    return []
  }
}

/**
 * Sends a support notification to every configured admin.
 *
 * Notification failures are non-fatal.
 */
async function notifyAdmins(
  title: string,
  body: string,
) {
  try {
    const adminIds = await getAdminIds()

    if (!adminIds.length) return

    await Promise.all(
      adminIds.map((adminId) =>
        notificationsService.notify(adminId, {
          type: SUPPORT_NOTIFICATION_TYPE,
          title,
          body,
          linkUrl: '/admin/support',
        }),
      ),
    )
  } catch {
    /*
     * A notification failure must not fail ticket
     * creation or customer replies.
     */
  }
}

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

    await notifyAdmins(
      'New support ticket',
      `${data.customerName} opened "${data.subject}".`,
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

    const senderIsCustomer =
      senderId === ticket.customerId

    if (senderIsCustomer) {
      await notifyAdmins(
        'New support reply',
        `${ticket.customerName} replied to "${ticket.subject}".`,
      )

      return
    }

    await notificationsService.notify(
      ticket.customerId,
      {
        type: SUPPORT_NOTIFICATION_TYPE,
        title: 'Support team replied',
        body: `You have a new reply on "${ticket.subject}".`,
        linkUrl: '/account/support',
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

    await notificationsService.notify(
      ticket.customerId,
      {
        type: SUPPORT_NOTIFICATION_TYPE,
        title: 'Support ticket updated',
        body: `"${ticket.subject}" is now ${STATUS_LABELS[
          status
        ].toLowerCase()}.`,
        linkUrl: '/account/support',
      },
    )
  },
}