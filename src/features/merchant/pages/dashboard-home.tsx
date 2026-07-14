import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { orderBy, where } from 'firebase/firestore'
import dayjs from 'dayjs'
import {
  AlertTriangle,
  ArrowRight,
  Clock,
  DollarSign,
  Package,
  PackageX,
  ShoppingCart,
} from 'lucide-react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { StatCard, EmptyState } from '@/components/ui/misc'
import { StatCardSkeleton, TableSkeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { PageHeader } from '@/layouts/dashboard-layout'
import { useRealtimeCollection } from '@/hooks/use-realtime'
import { LiveBadge } from '@/components/shared/live-badge'
import { COLLECTIONS } from '@/lib/constants'
import { formatCurrency, formatNumber, timeAgo, truncate } from '@/lib/utils'
import type { Order, Product } from '@/types'
import { ErrorState, OrderStatusBadge, useMerchant } from '../components/common'

export default function DashboardHomePage() {
  const { store } = useMerchant()

  // Live subscriptions — stats, charts and the recent-orders feed update in
  // real time as orders arrive and stock changes
  const productsQ = useRealtimeCollection<Product>(
    COLLECTIONS.products,
    [where('storeId', '==', store.id), orderBy('createdAt', 'desc')],
    [store.id],
  )
  const ordersQ = useRealtimeCollection<Order>(
    COLLECTIONS.orders,
    [where('storeId', '==', store.id), orderBy('createdAt', 'desc')],
    [store.id],
  )

  const products = productsQ.data ?? []
  const orders = ordersQ.data ?? []

  const stats = useMemo(() => {
    const completed = orders.filter((o) => o.status === 'completed')
    const revenue = completed.reduce((s, o) => s + o.total, 0)
    const pendingOrders = orders.filter((o) => o.status === 'pending').length
    const lowStock = products.filter(
      (p) => p.status !== 'archived' && p.stock > 0 && p.stock <= (p.lowStockThreshold ?? 5),
    ).length
    const outOfStock = products.filter((p) => p.status !== 'archived' && p.stock <= 0).length
    return { revenue, pendingOrders, lowStock, outOfStock }
  }, [orders, products])

  const revenueByDay = useMemo(() => {
    const days = Array.from({ length: 30 }, (_, i) => dayjs().subtract(29 - i, 'day'))
    const buckets = new Map(days.map((d) => [d.format('YYYY-MM-DD'), 0]))
    for (const o of orders) {
      if (o.status !== 'completed') continue
      const key = dayjs(o.createdAt).format('YYYY-MM-DD')
      if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + o.total)
    }
    return days.map((d) => ({
      day: d.format('MMM D'),
      revenue: Math.round((buckets.get(d.format('YYYY-MM-DD')) ?? 0) * 100) / 100,
    }))
  }, [orders])

  const topProducts = useMemo(() => {
    const units = new Map<string, { name: string; units: number }>()
    for (const o of orders) {
      if (o.status === 'cancelled') continue
      for (const item of o.items) {
        const entry = units.get(item.productId) ?? { name: item.name, units: 0 }
        entry.units += item.quantity
        units.set(item.productId, entry)
      }
    }
    return [...units.values()]
      .sort((a, b) => b.units - a.units)
      .slice(0, 8)
      .map((e) => ({ ...e, name: truncate(e.name, 18) }))
  }, [orders])

  const recentOrders = orders.slice(0, 8)
  const pendingReviewCount = products.filter((p) => p.status === 'pending').length

  const loading = productsQ.isLoading || ordersQ.isLoading

  if (productsQ.isError || ordersQ.isError) {
    return <ErrorState onRetry={() => window.location.reload()} />
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Welcome back, ${store.name}`}
        description="Here's how your store is performing."
        actions={
          <>
            <LiveBadge className="mr-1" />
            <Button asChild>
              <Link to="/merchant/products/new">Add product</Link>
            </Button>
          </>
        }
      />

      {pendingReviewCount > 0 && (
        <div className="flex items-center gap-3 rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm">
          <Clock className="size-4 shrink-0 text-warning" />
          <p className="flex-1">
            <span className="font-medium">{pendingReviewCount}</span> product
            {pendingReviewCount > 1 ? 's are' : ' is'} awaiting admin review.
          </p>
          <Button asChild variant="ghost" size="sm">
            <Link to="/merchant/products">
              View <ArrowRight className="size-3.5" />
            </Link>
          </Button>
        </div>
      )}

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <StatCardSkeleton key={i} />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <StatCard title="Revenue" value={formatCurrency(stats.revenue)} icon={DollarSign} hint="Completed orders" />
          <StatCard title="Total orders" value={formatNumber(orders.length)} icon={ShoppingCart} />
          <StatCard title="Pending orders" value={formatNumber(stats.pendingOrders)} icon={Clock} hint="Awaiting confirmation" />
          <StatCard title="Products" value={formatNumber(products.length)} icon={Package} />
          <StatCard
            title="Low stock"
            value={formatNumber(stats.lowStock)}
            icon={AlertTriangle}
            hint={`${stats.outOfStock} out of stock`}
          />
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Revenue — last 30 days</CardTitle>
            <CardDescription>Completed order totals per day</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={revenueByDay} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--color-primary)" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="var(--color-primary)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                  <XAxis dataKey="day" tick={{ fontSize: 11 }} interval="preserveStartEnd" tickLine={false} />
                  <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={48} />
                  <Tooltip formatter={(v) => formatCurrency(Number(v))} />
                  <Area type="monotone" dataKey="revenue" stroke="var(--color-primary)" fill="url(#revGrad)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Top products</CardTitle>
            <CardDescription>Units sold across all orders</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              {topProducts.length === 0 ? (
                <EmptyState icon={PackageX} title="No sales yet" description="Top sellers appear here once orders come in." className="py-8" />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={topProducts} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} tickLine={false} interval={0} angle={-20} textAnchor="end" height={50} />
                    <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={32} allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="units" fill="var(--color-primary)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>Recent orders</CardTitle>
            <CardDescription>Your 8 most recent orders</CardDescription>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link to="/merchant/orders">View all</Link>
          </Button>
        </CardHeader>
        <CardContent>
          {ordersQ.isLoading ? (
            <TableSkeleton rows={4} />
          ) : recentOrders.length === 0 ? (
            <EmptyState
              icon={ShoppingCart}
              title="No orders yet"
              description="New orders will show up here as soon as customers start buying."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Items</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Placed</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentOrders.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell>
                      <Link to={`/merchant/orders/${o.id}`} className="font-medium text-primary hover:underline">
                        {o.orderNumber}
                      </Link>
                    </TableCell>
                    <TableCell>{o.customerName}</TableCell>
                    <TableCell>{o.items.length}</TableCell>
                    <TableCell className="font-medium">{formatCurrency(o.total)}</TableCell>
                    <TableCell>
                      <OrderStatusBadge status={o.status} />
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">{timeAgo(o.createdAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
