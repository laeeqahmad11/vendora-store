import {
  createBrowserRouter,
  Outlet,
} from 'react-router-dom'
import { StorefrontLayout } from '@/layouts/storefront-layout'
import {
  AuthLayout,
  ForgotPasswordPage,
  LoginPage,
  RegisterPage,
  SuspendedPage,
} from '@/features/auth/auth-pages'
import {
  RequireAuth,
  RequireRole,
} from '@/components/shared/route-guards'
import { NotFoundPage } from '@/components/shared/not-found'
import { storefrontRoutes } from '@/features/storefront/routes'
import { customerRoutes } from '@/features/customer/routes'
import { merchantRoutes } from '@/features/merchant/routes'
import { adminRoutes } from '@/features/admin/routes'

function RootLayout() {
  return <Outlet />
}

export const router = createBrowserRouter([
  {
    element: <RootLayout />,
    children: [
      {
        path: '/',
        element: <StorefrontLayout />,
        children: [
          ...storefrontRoutes,
          {
            element: <RequireAuth />,
            children: customerRoutes,
          },
          {
            path: '*',
            element: <NotFoundPage />,
          },
        ],
      },
      {
        path: '/auth',
        element: <AuthLayout />,
        children: [
          {
            path: 'login',
            element: <LoginPage />,
          },
          {
            path: 'register',
            element: <RegisterPage />,
          },
          {
            path: 'forgot-password',
            element: <ForgotPasswordPage />,
          },
        ],
      },
      {
        path: '/merchant',
        element: <RequireAuth />,
        children: merchantRoutes,
      },
      {
        path: '/admin',
        element: <RequireRole role="admin" />,
        children: adminRoutes,
      },
      {
        path: '/suspended',
        element: <SuspendedPage />,
      },
      {
        path: '*',
        element: <NotFoundPage />,
      },
    ],
  },
])