import { createBrowserRouter } from 'react-router-dom'
import { StorefrontLayout } from '@/layouts/storefront-layout'
import {
  AuthLayout,
  ForgotPasswordPage,
  LoginPage,
  RegisterPage,
  SuspendedPage,
} from '@/features/auth/auth-pages'
import { RequireAuth, RequireRole } from '@/components/shared/route-guards'
import { NotFoundPage } from '@/components/shared/not-found'
import { storefrontRoutes } from '@/features/storefront/routes'
import { customerRoutes } from '@/features/customer/routes'
import { merchantRoutes } from '@/features/merchant/routes'
import { adminRoutes } from '@/features/admin/routes'

export const router = createBrowserRouter([
  {
    path: '/',
    element: <StorefrontLayout />,
    children: [
      ...storefrontRoutes,
      {
        element: <RequireAuth />,
        children: customerRoutes, // /account/*
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
  {
    path: '/auth',
    element: <AuthLayout />,
    children: [
      { path: 'login', element: <LoginPage /> },
      { path: 'register', element: <RegisterPage /> },
      { path: 'forgot-password', element: <ForgotPasswordPage /> },
    ],
  },
  {
    // /merchant is auth-gated (not role-gated): customers see the "open a
    // store" application flow; approved merchants get the dashboard.
    path: '/merchant',
    element: <RequireAuth />,
    children: merchantRoutes,
  },
  {
    path: '/admin',
    element: <RequireRole role="admin" />,
    children: adminRoutes,
  },
  { path: '/suspended', element: <SuspendedPage /> },
  { path: '*', element: <NotFoundPage /> },
])
