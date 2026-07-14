import { lazy, Suspense, type ReactNode } from 'react'
import type { RouteObject } from 'react-router-dom'
import { Spinner } from '@/components/ui/misc'

const HomePage = lazy(() => import('./pages/home'))
const ProductListingPage = lazy(() => import('./pages/shop'))
const CategoriesPage = lazy(() => import('./pages/categories'))
const ProductDetailPage = lazy(() => import('./pages/product-detail'))
const StoresPage = lazy(() => import('./pages/stores'))
const StoreDetailPage = lazy(() => import('./pages/store-detail'))
const CartPage = lazy(() => import('./pages/cart'))
const CheckoutPage = lazy(() => import('./pages/checkout'))
const OrderSuccessPage = lazy(() => import('./pages/order-success'))
const BlogListPage = lazy(() => import('./pages/blog-list'))
const BlogPostPage = lazy(() => import('./pages/blog-post'))
const FAQPage = lazy(() => import('./pages/faq'))
const AboutPage = lazy(() => import('./pages/about'))
const ContactPage = lazy(() => import('./pages/contact'))
const StaticPageRenderer = lazy(() => import('./pages/static-page'))
const ComparePage = lazy(() => import('./pages/compare'))

const wrap = (el: ReactNode) => <Suspense fallback={<Spinner className="min-h-[60vh]" />}>{el}</Suspense>

export const storefrontRoutes: RouteObject[] = [
  { index: true, element: wrap(<HomePage />) },
  { path: 'shop', element: wrap(<ProductListingPage />) },
  { path: 'categories', element: wrap(<CategoriesPage />) },
  { path: 'products/:slug', element: wrap(<ProductDetailPage />) },
  { path: 'stores', element: wrap(<StoresPage />) },
  { path: 'stores/:slug', element: wrap(<StoreDetailPage />) },
  { path: 'cart', element: wrap(<CartPage />) },
  { path: 'checkout', element: wrap(<CheckoutPage />) },
  { path: 'order-success', element: wrap(<OrderSuccessPage />) },
  { path: 'blog', element: wrap(<BlogListPage />) },
  { path: 'blog/:slug', element: wrap(<BlogPostPage />) },
  { path: 'faq', element: wrap(<FAQPage />) },
  { path: 'about', element: wrap(<AboutPage />) },
  { path: 'contact', element: wrap(<ContactPage />) },
  { path: 'pages/:pageId', element: wrap(<StaticPageRenderer />) },
  { path: 'compare', element: wrap(<ComparePage />) },
]
