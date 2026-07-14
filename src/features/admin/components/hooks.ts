import { useAuthStore } from '@/stores/auth-store'
import type { UserRole } from '@/types'

export interface AdminActor {
  id: string
  name: string
  role: UserRole
}

/** Actor payload for audited service calls, built from the signed-in admin. */
export function useAdminActor(): AdminActor {
  const profile = useAuthStore((s) => s.profile)
  return { id: profile?.id ?? '', name: profile?.displayName ?? 'Admin', role: 'admin' }
}
