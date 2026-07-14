import { lazy, Suspense } from 'react'
import type { RouteObject } from 'react-router-dom'
import { Spinner } from '@/components/ui/misc'
import { MerchantGate } from './components/merchant-gate'

const DashboardHomePage = lazy(() => import('./pages/dashboard-home'))
const ProductsListPage = lazy(() => import('./pages/products-list'))
const ProductFormPage = lazy(() => import('./pages/product-form'))
const InventoryPage = lazy(() => import('./pages/inventory'))
const OrdersListPage = lazy(() => import('./pages/orders-list'))
const OrderDetailPage = lazy(() => import('./pages/order-detail'))
const CustomersPage = lazy(() => import('./pages/customers'))
const DiscountsPage = lazy(() => import('./pages/discounts'))
const CollectionsPage = lazy(() => import('./pages/collections'))
const ReviewsPage = lazy(() => import('./pages/reviews'))
const AnalyticsPage = lazy(() => import('./pages/analytics'))
const StoreSettingsPage = lazy(() => import('./pages/settings'))

const wrap = (el: React.ReactNode) => <Suspense fallback={<Spinner />}>{el}</Suspense>

/**
 * /merchant/* — MerchantGate handles the store application/approval flow and,
 * once approved, renders the dashboard shell (sidebar + topbar + <Outlet/>).
 */
export const merchantRoutes: RouteObject[] = [
  {
    element: <MerchantGate />,
    children: [
      { index: true, element: wrap(<DashboardHomePage />) },
      { path: 'products', element: wrap(<ProductsListPage />) },
      { path: 'products/new', element: wrap(<ProductFormPage />) },
      { path: 'products/:productId/edit', element: wrap(<ProductFormPage />) },
      { path: 'inventory', element: wrap(<InventoryPage />) },
      { path: 'orders', element: wrap(<OrdersListPage />) },
      { path: 'orders/:orderId', element: wrap(<OrderDetailPage />) },
      { path: 'customers', element: wrap(<CustomersPage />) },
      { path: 'discounts', element: wrap(<DiscountsPage />) },
      { path: 'collections', element: wrap(<CollectionsPage />) },
      { path: 'reviews', element: wrap(<ReviewsPage />) },
      { path: 'analytics', element: wrap(<AnalyticsPage />) },
      { path: 'settings', element: wrap(<StoreSettingsPage />) },
    ],
  },
]
