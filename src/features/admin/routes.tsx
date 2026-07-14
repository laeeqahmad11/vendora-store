import * as React from 'react'
import type { RouteObject } from 'react-router-dom'
import {
  BarChart3,
  FileText,
  History,
  LayoutDashboard,
  LifeBuoy,
  Megaphone,
  PackageCheck,
  Settings,
  Shapes,
  ShoppingCart,
  Store,
  Users,
} from 'lucide-react'
import { DashboardLayout, type DashboardNavItem } from '@/layouts/dashboard-layout'
import { Spinner } from '@/components/ui/misc'

const OverviewPage = React.lazy(() => import('./pages/overview'))
const MerchantsPage = React.lazy(() => import('./pages/merchants'))
const ProductApprovalPage = React.lazy(() => import('./pages/product-approval'))
const OrdersMonitorPage = React.lazy(() => import('./pages/orders-monitor'))
const CatalogPage = React.lazy(() => import('./pages/catalog'))
const UsersPage = React.lazy(() => import('./pages/users'))
const PromotionsPage = React.lazy(() => import('./pages/promotions'))
const CMSPage = React.lazy(() => import('./pages/cms'))
const SupportTicketsPage = React.lazy(() => import('./pages/support'))
const ReportsPage = React.lazy(() => import('./pages/reports'))
const ActivityLogPage = React.lazy(() => import('./pages/activity'))
const PlatformSettingsPage = React.lazy(() => import('./pages/settings'))

const nav: DashboardNavItem[] = [
  { to: '/admin', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/admin/merchants', label: 'Merchants', icon: Store },
  { to: '/admin/products', label: 'Products', icon: PackageCheck },
  { to: '/admin/orders', label: 'Orders', icon: ShoppingCart },
  { to: '/admin/catalog', label: 'Catalog', icon: Shapes },
  { to: '/admin/users', label: 'Users', icon: Users },
  { to: '/admin/promotions', label: 'Promotions', icon: Megaphone },
  { to: '/admin/cms', label: 'CMS', icon: FileText },
  { to: '/admin/support', label: 'Support', icon: LifeBuoy },
  { to: '/admin/reports', label: 'Reports', icon: BarChart3 },
  { to: '/admin/activity', label: 'Activity Log', icon: History },
  { to: '/admin/settings', label: 'Settings', icon: Settings },
]

function page(element: React.ReactNode) {
  return <React.Suspense fallback={<Spinner />}>{element}</React.Suspense>
}

export const adminRoutes: RouteObject[] = [
  {
    element: <DashboardLayout title="Admin" nav={nav} />,
    children: [
      { index: true, element: page(<OverviewPage />) },
      { path: 'merchants', element: page(<MerchantsPage />) },
      { path: 'products', element: page(<ProductApprovalPage />) },
      { path: 'orders', element: page(<OrdersMonitorPage />) },
      { path: 'catalog', element: page(<CatalogPage />) },
      { path: 'users', element: page(<UsersPage />) },
      { path: 'promotions', element: page(<PromotionsPage />) },
      { path: 'cms', element: page(<CMSPage />) },
      { path: 'support', element: page(<SupportTicketsPage />) },
      { path: 'reports', element: page(<ReportsPage />) },
      { path: 'activity', element: page(<ActivityLogPage />) },
      { path: 'settings', element: page(<PlatformSettingsPage />) },
    ],
  },
]
