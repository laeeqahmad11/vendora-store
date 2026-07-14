import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth-store'
import { Spinner } from '@/components/ui/misc'
import type { UserRole } from '@/types'

/** Requires any authenticated user */
export function RequireAuth() {
  const { firebaseUser, initialized } = useAuthStore()
  const location = useLocation()
  if (!initialized) return <Spinner className="min-h-screen" />
  if (!firebaseUser) return <Navigate to="/auth/login" state={{ from: location.pathname }} replace />
  return <Outlet />
}

/** Requires a specific role; redirects to the user's own home otherwise */
export function RequireRole({ role }: { role: UserRole }) {
  const { firebaseUser, profile, role: userRole, initialized, loading } = useAuthStore()
  const location = useLocation()

  if (!initialized || (firebaseUser && loading)) return <Spinner className="min-h-screen" />
  if (!firebaseUser) return <Navigate to="/auth/login" state={{ from: location.pathname }} replace />
  if (profile?.suspended) return <Navigate to="/suspended" replace />
  if (userRole !== role) return <Navigate to={roleHome(userRole)} replace />
  return <Outlet />
}

export function roleHome(role: UserRole | null | undefined) {
  switch (role) {
    case 'admin':
      return '/admin'
    case 'merchant':
      return '/merchant'
    default:
      return '/'
  }
}
