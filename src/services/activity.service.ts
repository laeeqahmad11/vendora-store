import { limit, orderBy, where, type QueryConstraint } from 'firebase/firestore'
import { COLLECTIONS } from '@/lib/constants'
import { createDocument, queryDocs } from '@/services/firestore'
import type { ActivityLog, UserRole } from '@/types'

interface Actor {
  id: string
  name: string
  role: UserRole
}

export const activityService = {
  /** Best-effort audit logging — never throws into the calling flow */
  async log(actor: Actor, action: string, targetType: string, targetId: string, detail?: string) {
    try {
      await createDocument<ActivityLog>(COLLECTIONS.activityLogs, {
        actorId: actor.id,
        actorName: actor.name,
        actorRole: actor.role,
        action,
        targetType,
        targetId,
        detail: detail ?? '',
      } as Omit<ActivityLog, 'id' | 'createdAt' | 'updatedAt'>)
    } catch {
      // audit logging must never break the primary action
    }
  },

  async list(count = 100, targetType?: string) {
    const constraints: QueryConstraint[] = [orderBy('createdAt', 'desc'), limit(count)]
    if (targetType) constraints.unshift(where('targetType', '==', targetType))
    return queryDocs<ActivityLog>(COLLECTIONS.activityLogs, ...constraints)
  },
}
