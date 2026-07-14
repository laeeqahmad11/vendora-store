import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { Download, Package, Store as StoreIcon } from 'lucide-react'
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
import { PageHeader } from '@/layouts/dashboard-layout'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/misc'
import { ordersService } from '@/services/orders.service'
import { productsService } from '@/services/products.service'
import { ORDER_STATUS_LABELS } from '@/lib/constants'
import { formatCurrency, formatNumber } from '@/lib/utils'
import { bucketOrdersByDay, chartTooltipStyle, topMerchants } from '../components/analytics'
import { downloadCSV } from '../components/csv'

const RANGES = [
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
  { value: '365', label: 'Last 365 days' },
]

export default function ReportsPage() {
  const [range, setRange] = React.useState('30')
  const days = Number(range)

  const ordersQ = useQuery({ queryKey: ['admin-orders-report'], queryFn: () => ordersService.listAll(1000) })
  const topProductsQ = useQuery({
    queryKey: ['admin-top-products'],
    queryFn: () => productsService.listBestSellers(10),
  })

  const cutoff = dayjs().subtract(days, 'day').startOf('day').valueOf()
  const orders = (ordersQ.data ?? []).filter((o) => o.createdAt >= cutoff)
  const daily = bucketOrdersByDay(orders, days)
  const merchants = topMerchants(orders, 10)
  const totalRevenue = orders.filter((o) => o.status === 'completed').reduce((s, o) => s + o.total, 0)

  const exportOrders = () =>
    downloadCSV(
      `orders-report-${range}d-${dayjs().format('YYYY-MM-DD')}.csv`,
      ['Order', 'Date', 'Store', 'Customer', 'Status', 'Total'],
      orders.map((o) => [
        o.orderNumber,
        dayjs(o.createdAt).format('YYYY-MM-DD HH:mm'),
        o.storeName,
        o.customerName,
        ORDER_STATUS_LABELS[o.status],
        o.total,
      ]),
    )

  const exportRevenue = () =>
    downloadCSV(
      `revenue-by-day-${range}d-${dayjs().format('YYYY-MM-DD')}.csv`,
      ['Date', 'Orders', 'Revenue'],
      daily.map((d) => [d.day, d.orders, d.revenue]),
    )

  return (
    <div>
      <PageHeader
        title="Reports"
        description={`${formatNumber(orders.length)} orders · ${formatCurrency(totalRevenue)} completed revenue in the selected period.`}
        actions={
          <>
            <Select value={range} onValueChange={setRange}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RANGES.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={exportOrders} disabled={orders.length === 0}>
              <Download /> Orders CSV
            </Button>
            <Button variant="outline" onClick={exportRevenue} disabled={orders.length === 0}>
              <Download /> Revenue CSV
            </Button>
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Revenue by day</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-72">
              {ordersQ.isLoading ? (
                <Skeleton className="size-full" />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={daily}>
                    <defs>
                      <linearGradient id="reportRev" x1="0" y1="0" x2="0" y2="1">
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
                      fill="url(#reportRev)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Orders by day</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-72">
              {ordersQ.isLoading ? (
                <Skeleton className="size-full" />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={daily}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={24} />
                    <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={40} allowDecimals={false} />
                    <Tooltip contentStyle={chartTooltipStyle} cursor={{ fill: 'var(--muted)' }} />
                    <Bar dataKey="orders" name="Orders" fill="var(--primary)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Top merchants</CardTitle>
          </CardHeader>
          <CardContent>
            {ordersQ.isLoading ? (
              <Skeleton className="h-48 w-full" />
            ) : merchants.length === 0 ? (
              <EmptyState icon={StoreIcon} title="No sales in this period" className="py-8" />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>Store</TableHead>
                    <TableHead>Orders</TableHead>
                    <TableHead className="text-right">Revenue</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {merchants.map((m, i) => (
                    <TableRow key={m.storeId}>
                      <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                      <TableCell className="font-medium">{m.storeName}</TableCell>
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
          <CardHeader>
            <CardTitle className="text-base">Top products by units sold</CardTitle>
          </CardHeader>
          <CardContent>
            {topProductsQ.isLoading ? (
              <Skeleton className="h-48 w-full" />
            ) : (topProductsQ.data ?? []).length === 0 ? (
              <EmptyState icon={Package} title="No products sold yet" className="py-8" />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>Price</TableHead>
                    <TableHead className="text-right">Sold</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(topProductsQ.data ?? []).map((p, i) => (
                    <TableRow key={p.id}>
                      <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                      <TableCell>
                        <span className="flex items-center gap-2 font-medium">
                          {p.images[0] && (
                            <img src={p.images[0]} alt={p.name} className="size-8 rounded-md border object-cover" />
                          )}
                          <span className="max-w-52 truncate">{p.name}</span>
                        </span>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{formatCurrency(p.price, p.currency || 'USD')}</TableCell>
                      <TableCell className="text-right font-semibold">{formatNumber(p.soldCount)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
