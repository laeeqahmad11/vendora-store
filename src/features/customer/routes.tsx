import { lazy, Suspense, type ReactNode } from 'react'
import type { RouteObject } from 'react-router-dom'
import { Spinner } from '@/components/ui/misc'

const AccountLayout = lazy(() => import('./components/account-layout'))
const ProfilePage = lazy(() => import('./pages/profile'))
const OrdersListPage = lazy(() => import('./pages/orders-list'))
const OrderDetailPage = lazy(() => import('./pages/order-detail'))
const AddressesPage = lazy(() => import('./pages/addresses'))
const WishlistPage = lazy(() => import('./pages/wishlist'))
const MyReviewsPage = lazy(() => import('./pages/my-reviews'))
const NotificationsPage = lazy(() => import('./pages/notifications'))
const SupportPage = lazy(() => import('./pages/support'))
const SecurityPage = lazy(() => import('./pages/security'))

const wrap = (el: ReactNode) => <Suspense fallback={<Spinner className="min-h-[40vh]" />}>{el}</Suspense>

/** /account/* — customer self-service area (mounted behind RequireAuth) */
export const customerRoutes: RouteObject[] = [
  {
    path: 'account',
    element: wrap(<AccountLayout />),
    children: [
      { index: true, element: wrap(<ProfilePage />) },
      { path: 'orders', element: wrap(<OrdersListPage />) },
      { path: 'orders/:orderId', element: wrap(<OrderDetailPage />) },
      { path: 'addresses', element: wrap(<AddressesPage />) },
      { path: 'wishlist', element: wrap(<WishlistPage />) },
      { path: 'reviews', element: wrap(<MyReviewsPage />) },
      { path: 'notifications', element: wrap(<NotificationsPage />) },
      { path: 'support', element: wrap(<SupportPage />) },
      { path: 'security', element: wrap(<SecurityPage />) },
    ],
  },
]
