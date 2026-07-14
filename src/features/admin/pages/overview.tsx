import { useQuery } from '@tanstack/react-query'
import { limit, orderBy } from 'firebase/firestore'
import { Link } from 'react-router-dom'
import {
  Activity,
  ClipboardCheck,
  DollarSign,
  Package,
  ShoppingCart,
  Store as StoreIcon,
  Users,
} from 'lucide-react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { PageHeader } from '@/layouts/dashboard-layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { StatCardSkeleton, Skeleton } from '@/components/ui/skeleton'
import { EmptyState, StatCard } from '@/components/ui/misc'
import { storesService } from '@/services/stores.service'
import { usersService } from '@/services/users.service'
import { productsService } from '@/services/products.service'
import { useRealtimeCollection } from '@/hooks/use-realtime'
import { LiveBadge } from '@/components/shared/live-badge'
import { COLLECTIONS, ORDER_STATUS_LABELS } from '@/lib/constants'
import { formatCurrency, formatNumber, timeAgo } from '@/lib/utils'
import type { ActivityLog, Order, OrderStatus } from '@/types'
import { bucketOrdersByDay, chartTooltipStyle, PIE_COLORS, topMerchants } from '../components/analytics'

export default function OverviewPage() {
  // Live subscriptions — stats, charts and the activity feed update in real
  // time as orders and platform events stream in
  const ordersQ = useRealtimeCollection<Order>(
    COLLECTIONS.orders,
    [orderBy('createdAt', 'desc'), limit(500)],
    [],
  )
  const storesQ = useQuery({ queryKey: ['admin-stores'], queryFn: () => storesService.listAll() })
  const usersQ = useQuery({ queryKey: ['admin-users'], queryFn: () => usersService.list(undefined, 500) })
  const productsQ = useQuery({
    queryKey: ['admin-products-approved'],
    queryFn: () => productsService.listForSearch(1000),
  })
  const pendingProductsQ = useQuery({
    queryKey: ['admin-products-pending'],
    queryFn: () => productsService.listPendingApproval(),
  })
  const activityQ = useRealtimeCollection<ActivityLog>(
    COLLECTIONS.activityLogs,
    [orderBy('createdAt', 'desc'), limit(15)],
    [],
  )

  const orders = ordersQ.data ?? []
  const loading = ordersQ.isLoading || storesQ.isLoading || usersQ.isLoading

  const revenue = orders.filter((o) => o.status === 'completed').reduce((s, o) => s + o.total, 0)
  const merchants = (usersQ.data ?? []).filter((u) => u.role === 'merchant').length
  const customers = (usersQ.data ?? []).filter((u) => u.role === 'customer').length
  const pendingStores = (storesQ.data ?? []).filter((s) => s.status === 'pending').length
  const pendingApprovals = pendingStores + (pendingProductsQ.data?.length ?? 0)

  const revenueData = bucketOrdersByDay(orders, 30)
  const statusCounts = orders.reduce<Record<string, number>>((acc, o) => {
    acc[o.status] = (acc[o.status] ?? 0) + 1
    return acc
  }, {})
  const statusData = Object.entries(statusCounts).map(([status, value]) => ({
    name: ORDER_STATUS_LABELS[status as OrderStatus] ?? status,
    value,
  }))
  const merchantStats = topMerchants(orders, 5)

  return (
    <div>
      <PageHeader title="Overview" description="Platform-wide health at a glance." actions={<LiveBadge />} />

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <StatCardSkeleton key={i} />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <StatCard title="Platform Revenue" value={formatCurrency(revenue)} icon={DollarSign} hint="Completed orders" />
          <StatCard title="Total Orders" value={formatNumber(orders.length)} icon={ShoppingCart} />
          <StatCard title="Merchants" value={formatNumber(merchants)} icon={StoreIcon} />
          <StatCard title="Customers" value={formatNumber(customers)} icon={Users} />
          <StatCard title="Products" value={formatNumber(productsQ.data?.length ?? 0)} icon={Package} hint="Approved listings" />
          <StatCard
            title="Pending Approvals"
            value={formatNumber(pendingApprovals)}
            icon={ClipboardCheck}
            hint={`${pendingStores} stores · ${pendingProductsQ.data?.length ?? 0} products`}
          />
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Revenue — last 30 days</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-72">
              {ordersQ.isLoading ? (
                <Skeleton className="size-full" />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={revenueData}>
                    <defs>
                      <linearGradient id="adminRev" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.35} />
                        <stop offset="95%" stopColor="var(--primary)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={24} />
                    <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={52} />
                    <Tooltip contentStyle={chartTooltipStyle} />
                    <Area
                      type="monotone"
                      dataKey="revenue"
                      name="Revenue"
                      stroke="var(--primary)"
                      strokeWidth={2}
                      fill="url(#adminRev)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Orders by status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-72">
              {ordersQ.isLoading ? (
                <Skeleton className="size-full" />
              ) : statusData.length === 0 ? (
                <EmptyState icon={ShoppingCart} title="No orders yet" className="py-8" />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={statusData} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={2}>
                      {statusData.map((entry, i) => (
                        <Cell key={entry.name} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={chartTooltipStyle} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Top merchants by revenue</CardTitle>
          </CardHeader>
          <CardContent>
            {ordersQ.isLoading ? (
              <Skeleton className="h-48 w-full" />
            ) : merchantStats.length === 0 ? (
              <EmptyState icon={StoreIcon} title="No sales yet" className="py-8" />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Store</TableHead>
                    <TableHead>Orders</TableHead>
                    <TableHead className="text-right">Revenue</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {merchantStats.map((m, i) => (
                    <TableRow key={m.storeId}>
                      <TableCell>
                        <span className="flex items-center gap-2 font-medium">
                          <Badge variant="secondary">#{i + 1}</Badge>
                          {m.storeName}
                        </span>
                      </TableCell>
                      <TableCell>{formatNumber(m.orders)}</TableCell>
                      <TableCell className="text-right font-semibold">{formatCurrency(m.revenue)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">Latest activity</CardTitle>
            <Link to="/admin/activity" className="text-xs font-medium text-primary hover:underline">
              View all
            </Link>
          </CardHeader>
          <CardContent>
            {activityQ.isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : (activityQ.data ?? []).length === 0 ? (
              <EmptyState icon={Activity} title="No activity yet" className="py-8" />
            ) : (
              <ul className="space-y-4">
                {(activityQ.data ?? []).map((log) => (
                  <li key={log.id} className="flex items-start gap-3 text-sm">
                    <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />
                    <div className="min-w-0">
                      <p className="truncate">
                        <span className="font-medium">{log.actorName}</span>{' '}
                        <span className="text-muted-foreground">{log.action.replace(/[._]/g, ' ')}</span>
                      </p>
                      {log.detail && <p className="truncate text-xs text-muted-foreground">{log.detail}</p>}
                      <p className="text-xs text-muted-foreground">{timeAgo(log.createdAt)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
