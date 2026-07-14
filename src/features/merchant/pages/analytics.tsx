import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import dayjs from 'dayjs'
import {
  BarChart3,
  Download,
  DollarSign,
  Repeat,
  ShoppingCart,
  UserPlus,
} from 'lucide-react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  EmptyState,
  StatCard,
} from '@/components/ui/misc'
import {
  StatCardSkeleton,
  Skeleton,
} from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { PageHeader } from '@/layouts/dashboard-layout'
import { ordersService } from '@/services/orders.service'
import { ORDER_STATUS_LABELS } from '@/lib/constants'
import {
  formatCurrency,
  formatNumber,
  truncate,
} from '@/lib/utils'
import {
  ErrorState,
  downloadCsv,
  useMerchant,
} from '../components/common'

const RANGES = [
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
]

const PIE_COLORS = [
  'var(--color-primary)',
  '#22c55e',
  '#f59e0b',
  '#3b82f6',
  '#ef4444',
  '#a855f7',
  '#14b8a6',
  '#64748b',
  '#ec4899',
  '#84cc16',
]

export default function AnalyticsPage() {
  const { store } = useMerchant()

  const [range, setRange] = React.useState('30')
  const days = Number(range)

  const ordersQ = useQuery({
    queryKey: ['merchant-orders', store.id],
    queryFn: () =>
      ordersService.listByStore(store.id),
  })

  const allOrders = ordersQ.data ?? []

  const rangeStart = dayjs()
    .subtract(days - 1, 'day')
    .startOf('day')
    .valueOf()

  const orders = React.useMemo(
    () =>
      allOrders.filter(
        (order) => order.createdAt >= rangeStart,
      ),
    [allOrders, rangeStart],
  )

  const data = React.useMemo(() => {
    const dayList = Array.from(
      { length: days },
      (_, index) =>
        dayjs().subtract(
          days - 1 - index,
          'day',
        ),
    )

    const revenueBuckets = new Map(
      dayList.map((date) => [
        date.format('YYYY-MM-DD'),
        0,
      ]),
    )

    const orderBuckets = new Map(
      dayList.map((date) => [
        date.format('YYYY-MM-DD'),
        0,
      ]),
    )

    for (const order of orders) {
      const key = dayjs(
        order.createdAt,
      ).format('YYYY-MM-DD')

      if (orderBuckets.has(key)) {
        orderBuckets.set(
          key,
          (orderBuckets.get(key) ?? 0) + 1,
        )
      }

      if (
        order.status === 'completed' &&
        revenueBuckets.has(key)
      ) {
        revenueBuckets.set(
          key,
          (revenueBuckets.get(key) ?? 0) +
            order.total,
        )
      }
    }

    const series = dayList.map((date) => ({
      day: date.format('MMM D'),
      revenue:
        Math.round(
          (revenueBuckets.get(
            date.format('YYYY-MM-DD'),
          ) ?? 0) * 100,
        ) / 100,
      orders:
        orderBuckets.get(
          date.format('YYYY-MM-DD'),
        ) ?? 0,
    }))

    const productMap = new Map<
      string,
      {
        name: string
        revenue: number
        units: number
      }
    >()

    for (const order of orders) {
      if (order.status === 'cancelled') {
        continue
      }

      for (const item of order.items) {
        const entry =
          productMap.get(item.productId) ?? {
            name: item.name,
            revenue: 0,
            units: 0,
          }

        entry.revenue +=
          item.price * item.quantity

        entry.units += item.quantity

        productMap.set(
          item.productId,
          entry,
        )
      }
    }

    const topProducts = [
      ...productMap.values(),
    ]
      .sort(
        (a, b) => b.revenue - a.revenue,
      )
      .slice(0, 8)
      .map((product) => ({
        ...product,
        name: truncate(product.name, 18),
        revenue:
          Math.round(
            product.revenue * 100,
          ) / 100,
      }))

    const statusMap = new Map<
      string,
      number
    >()

    for (const order of orders) {
      statusMap.set(
        order.status,
        (statusMap.get(order.status) ?? 0) +
          1,
      )
    }

    const statusDist = [
      ...statusMap.entries(),
    ].map(([status, count]) => ({
      name:
        ORDER_STATUS_LABELS[
          status as keyof typeof ORDER_STATUS_LABELS
        ] ?? status,
      value: count,
    }))

    const firstOrderAt = new Map<
      string,
      number
    >()

    for (const order of allOrders) {
      const previous = firstOrderAt.get(
        order.customerId,
      )

      if (
        previous == null ||
        order.createdAt < previous
      ) {
        firstOrderAt.set(
          order.customerId,
          order.createdAt,
        )
      }
    }

    const inRangeCustomers = new Set(
      orders.map(
        (order) => order.customerId,
      ),
    )

    let newCustomers = 0
    let returningCustomers = 0

    for (const customerId of inRangeCustomers) {
      if (
        (firstOrderAt.get(customerId) ?? 0) >=
        rangeStart
      ) {
        newCustomers++
      } else {
        returningCustomers++
      }
    }

    const completedOrders =
      orders.filter(
        (order) =>
          order.status === 'completed',
      )

    const revenue =
      completedOrders.reduce(
        (sum, order) =>
          sum + order.total,
        0,
      )

    const avgOrder =
      completedOrders.length > 0
        ? revenue /
          completedOrders.length
        : 0

    return {
      series,
      topProducts,
      statusDist,
      newCustomers,
      returningCustomers,
      revenue,
      avgOrder,
    }
  }, [
    orders,
    allOrders,
    days,
    rangeStart,
  ])

  const exportOrders = () => {
    downloadCsv(
      `orders-${store.slug}-${range}d.csv`,
      [
        'orderNumber',
        'date',
        'customer',
        'email',
        'items',
        'subtotal',
        'discount',
        'shipping',
        'tax',
        'total',
        'status',
        'cashReceived',
      ],
      orders.map((order) => [
        order.orderNumber,
        dayjs(order.createdAt).format(
          'YYYY-MM-DD HH:mm',
        ),
        order.customerName,
        order.customerEmail,
        order.items.reduce(
          (sum, item) =>
            sum + item.quantity,
          0,
        ),
        order.subtotal,
        order.discount,
        order.shippingFee,
        order.tax,
        order.total,
        order.status,
        order.cashReceived
          ? 'yes'
          : 'no',
      ]),
    )
  }

  if (ordersQ.isError) {
    return (
      <ErrorState
        onRetry={() =>
          void ordersQ.refetch()
        }
      />
    )
  }

  return (
    <div className="min-w-0 space-y-6">
      <PageHeader
        title="Analytics"
        description="Understand your store's performance over time."
        actions={
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <Select
              value={range}
              onValueChange={setRange}
            >
              <SelectTrigger className="w-full sm:w-40">
                <SelectValue />
              </SelectTrigger>

              <SelectContent>
                {RANGES.map((item) => (
                  <SelectItem
                    key={item.value}
                    value={item.value}
                  >
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full sm:w-auto"
              onClick={exportOrders}
              disabled={orders.length === 0}
            >
              <Download className="size-4" />
              Export orders
            </Button>
          </div>
        }
      />

      {ordersQ.isLoading ? (
        <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-5">
          {Array.from({
            length: 5,
          }).map((_, index) => (
            <StatCardSkeleton key={index} />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-5">
          <StatCard
            title="Revenue"
            value={formatCurrency(
              data.revenue,
            )}
            icon={DollarSign}
            hint="Completed orders in range"
          />

          <StatCard
            title="Orders"
            value={formatNumber(
              orders.length,
            )}
            icon={ShoppingCart}
          />

          <StatCard
            title="Avg. order value"
            value={formatCurrency(
              data.avgOrder,
            )}
            icon={BarChart3}
          />

          <StatCard
            title="New customers"
            value={formatNumber(
              data.newCustomers,
            )}
            icon={UserPlus}
          />

          <StatCard
            title="Conversion rate"
            value="—"
            icon={Repeat}
            hint="Requires storefront traffic data"
          />
        </div>
      )}

      <div className="grid min-w-0 gap-5 xl:grid-cols-2">
        <Card className="min-w-0 overflow-hidden">
          <CardHeader className="p-4 sm:p-6">
            <CardTitle>Revenue</CardTitle>

            <CardDescription>
              Completed order totals per day
            </CardDescription>
          </CardHeader>

          <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
            <div className="h-[260px] w-full sm:h-[300px]">
              {ordersQ.isLoading ? (
                <Skeleton className="size-full" />
              ) : (
                <ResponsiveContainer
                  width="100%"
                  height="100%"
                >
                  <AreaChart
                    data={data.series}
                    margin={{
                      top: 5,
                      right: 8,
                      left: -8,
                      bottom: 0,
                    }}
                  >
                    <defs>
                      <linearGradient
                        id="anaRev"
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop
                          offset="5%"
                          stopColor="var(--color-primary)"
                          stopOpacity={0.35}
                        />

                        <stop
                          offset="95%"
                          stopColor="var(--color-primary)"
                          stopOpacity={0}
                        />
                      </linearGradient>
                    </defs>

                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="var(--color-border)"
                      vertical={false}
                    />

                    <XAxis
                      dataKey="day"
                      tick={{ fontSize: 10 }}
                      interval="preserveStartEnd"
                      tickLine={false}
                      axisLine={false}
                    />

                    <YAxis
                      tick={{ fontSize: 10 }}
                      tickLine={false}
                      axisLine={false}
                      width={46}
                    />

                    <Tooltip
                      formatter={(value) =>
                        formatCurrency(
                          Number(value),
                        )
                      }
                    />

                    <Area
                      type="monotone"
                      dataKey="revenue"
                      stroke="var(--color-primary)"
                      fill="url(#anaRev)"
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="min-w-0 overflow-hidden">
          <CardHeader className="p-4 sm:p-6">
            <CardTitle>
              Orders per day
            </CardTitle>

            <CardDescription>
              All orders regardless of status
            </CardDescription>
          </CardHeader>

          <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
            <div className="h-[260px] w-full sm:h-[300px]">
              {ordersQ.isLoading ? (
                <Skeleton className="size-full" />
              ) : (
                <ResponsiveContainer
                  width="100%"
                  height="100%"
                >
                  <BarChart
                    data={data.series}
                    margin={{
                      top: 5,
                      right: 8,
                      left: -8,
                      bottom: 0,
                    }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="var(--color-border)"
                      vertical={false}
                    />

                    <XAxis
                      dataKey="day"
                      tick={{ fontSize: 10 }}
                      interval="preserveStartEnd"
                      tickLine={false}
                      axisLine={false}
                    />

                    <YAxis
                      tick={{ fontSize: 10 }}
                      tickLine={false}
                      axisLine={false}
                      width={32}
                      allowDecimals={false}
                    />

                    <Tooltip />

                    <Bar
                      dataKey="orders"
                      fill="var(--color-primary)"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="min-w-0 overflow-hidden">
          <CardHeader className="p-4 sm:p-6">
            <CardTitle>
              Top products by revenue
            </CardTitle>

            <CardDescription>
              Within the selected range
            </CardDescription>
          </CardHeader>

          <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
            <div className="h-[280px] w-full sm:h-[320px]">
              {data.topProducts.length ===
              0 ? (
                <EmptyState
                  icon={BarChart3}
                  title="No sales in range"
                  className="py-8"
                />
              ) : (
                <ResponsiveContainer
                  width="100%"
                  height="100%"
                >
                  <BarChart
                    data={data.topProducts}
                    layout="vertical"
                    margin={{
                      top: 5,
                      right: 10,
                      left: 0,
                      bottom: 0,
                    }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="var(--color-border)"
                      horizontal={false}
                    />

                    <XAxis
                      type="number"
                      tick={{ fontSize: 10 }}
                      tickLine={false}
                      axisLine={false}
                    />

                    <YAxis
                      type="category"
                      dataKey="name"
                      tick={{ fontSize: 10 }}
                      width={105}
                      tickLine={false}
                      axisLine={false}
                    />

                    <Tooltip
                      formatter={(value) =>
                        formatCurrency(
                          Number(value),
                        )
                      }
                    />

                    <Bar
                      dataKey="revenue"
                      fill="var(--color-primary)"
                      radius={[0, 4, 4, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="min-w-0 overflow-hidden">
          <CardHeader className="p-4 sm:p-6">
            <CardTitle>
              Order status distribution
            </CardTitle>

            <CardDescription>
              Orders in range by current status
            </CardDescription>
          </CardHeader>

          <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
            <div className="h-[260px] w-full sm:h-[300px]">
              {data.statusDist.length ===
              0 ? (
                <EmptyState
                  icon={ShoppingCart}
                  title="No orders in range"
                  className="py-8"
                />
              ) : (
                <ResponsiveContainer
                  width="100%"
                  height="100%"
                >
                  <PieChart>
                    <Pie
                      data={data.statusDist}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={55}
                      outerRadius={85}
                      paddingAngle={2}
                    >
                      {data.statusDist.map(
                        (_, index) => (
                          <Cell
                            key={index}
                            fill={
                              PIE_COLORS[
                                index %
                                  PIE_COLORS.length
                              ]
                            }
                          />
                        ),
                      )}
                    </Pie>

                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
              {data.statusDist.map(
                (status, index) => (
                  <span
                    key={status.name}
                    className="flex items-center gap-1.5 text-xs text-muted-foreground"
                  >
                    <span
                      className="size-2.5 shrink-0 rounded-full"
                      style={{
                        background:
                          PIE_COLORS[
                            index %
                              PIE_COLORS.length
                          ],
                      }}
                    />

                    {status.name} (
                    {status.value})
                  </span>
                ),
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="min-w-0 overflow-hidden">
        <CardHeader className="p-4 sm:p-6">
          <CardTitle>Customers</CardTitle>

          <CardDescription>
            New vs returning customers who ordered
            in the selected range
          </CardDescription>
        </CardHeader>

        <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border p-4 transition hover:bg-muted/30 sm:p-5">
              <p className="text-sm font-medium text-muted-foreground">
                New customers
              </p>

              <p className="mt-1 text-2xl font-bold">
                {formatNumber(
                  data.newCustomers,
                )}
              </p>

              <p className="mt-1 text-xs text-muted-foreground">
                First-ever order placed within this
                range
              </p>
            </div>

            <div className="rounded-xl border p-4 transition hover:bg-muted/30 sm:p-5">
              <p className="text-sm font-medium text-muted-foreground">
                Returning customers
              </p>

              <p className="mt-1 text-2xl font-bold">
                {formatNumber(
                  data.returningCustomers,
                )}
              </p>

              <p className="mt-1 text-xs text-muted-foreground">
                Ordered before this range and came
                back
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}