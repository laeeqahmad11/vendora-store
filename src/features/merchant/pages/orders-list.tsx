import * as React from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { orderBy, where } from 'firebase/firestore'
import {
  Ban,
  CheckCircle2,
  Clock3,
  PackageCheck,
  Search,
  ShoppingCart,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/misc'
import { TableSkeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PageHeader } from '@/layouts/dashboard-layout'
import { LiveBadge } from '@/components/shared/live-badge'
import { useRealtimeCollection } from '@/hooks/use-realtime'
import { COLLECTIONS } from '@/lib/constants'
import {
  cn,
  formatCurrency,
  formatDate,
} from '@/lib/utils'
import type {
  Order,
  OrderStatus,
} from '@/types'
import {
  ErrorState,
  OrderStatusBadge,
  useMerchant,
} from '../components/common'

type OrdersTab = OrderStatus | 'all'

interface TabItem {
  value: OrdersTab
  label: string
}

interface SummaryCardProps {
  title: string
  value: number
  description: string
  icon: React.ElementType
  active: boolean
  onClick: () => void
}

const TABS: TabItem[] = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'packed', label: 'Packed' },
  { value: 'ready', label: 'Ready' },
  { value: 'dispatched', label: 'Dispatched' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'completed', label: 'Completed' },
  {
    value: 'refund_requested',
    label: 'Refunds',
  },
  { value: 'cancelled', label: 'Cancelled' },
]

function getItemCount(order: Order) {
  return order.items.reduce(
    (sum, item) => sum + item.quantity,
    0,
  )
}

function SummaryCard({
  title,
  value,
  description,
  icon: Icon,
  active,
  onClick,
}: SummaryCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="min-w-0 text-left"
    >
      <Card
        className={cn(
          'h-full p-4 transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md',
          active &&
            'border-primary/40 bg-primary/[0.035] ring-1 ring-primary/10',
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm text-muted-foreground">
              {title}
            </p>

            <p className="mt-2 text-2xl font-bold tracking-tight">
              {value}
            </p>

            <p className="mt-1 truncate text-xs text-muted-foreground">
              {description}
            </p>
          </div>

          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Icon className="size-5" />
          </span>
        </div>
      </Card>
    </button>
  )
}

export default function OrdersListPage() {
  const { store } = useMerchant()
  const navigate = useNavigate()

  const [tab, setTab] =
    React.useState<OrdersTab>('all')
  const [search, setSearch] =
    React.useState('')

  // Live subscription — new orders and status
  // changes appear without refreshing the page.
  const ordersQ =
    useRealtimeCollection<Order>(
      COLLECTIONS.orders,
      [
        where('storeId', '==', store.id),
        orderBy('createdAt', 'desc'),
      ],
      [store.id],
    )

  const orders = ordersQ.data ?? []

  const statusCounts = React.useMemo(() => {
    const counts: Partial<
      Record<OrderStatus, number>
    > = {}

    for (const order of orders) {
      counts[order.status] =
        (counts[order.status] ?? 0) + 1
    }

    return counts
  }, [orders])

  const pendingCount =
    statusCounts.pending ?? 0

  const inProgressCount = [
    'confirmed',
    'packed',
    'ready',
    'dispatched',
    'delivered',
  ].reduce(
    (total, status) =>
      total +
      (statusCounts[
        status as OrderStatus
      ] ?? 0),
    0,
  )

  const completedCount =
    statusCounts.completed ?? 0

  const cancelledCount =
    statusCounts.cancelled ?? 0

  const visible = React.useMemo(() => {
    let items =
      tab === 'all'
        ? orders
        : orders.filter(
            (order) =>
              order.status === tab,
          )

    const query =
      search.trim().toLowerCase()

    if (query) {
      items = items.filter((order) => {
        const searchableValues = [
          order.orderNumber,
          order.customerName,
          order.customerPhone,
          order.customerEmail,
        ]

        return searchableValues.some(
          (value) =>
            value
              ?.toLowerCase()
              .includes(query),
        )
      })
    }

    return items
  }, [orders, tab, search])

  const getTabCount = (
    value: OrdersTab,
  ) => {
    if (value === 'all') {
      return orders.length
    }

    return statusCounts[value] ?? 0
  }

  const openOrder = (orderId: string) => {
    navigate(`/merchant/orders/${orderId}`)
  }

  if (ordersQ.isError) {
    return (
      <ErrorState
        onRetry={() =>
          window.location.reload()
        }
      />
    )
  }

  return (
    <div className="min-w-0 space-y-5">
      <PageHeader
        title="Orders"
        description="Track and fulfil your customer orders."
        actions={<LiveBadge />}
      />

      {ordersQ.isLoading ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          {Array.from({ length: 5 }).map(
            (_, index) => (
              <div
                key={index}
                className="h-[118px] animate-pulse rounded-xl border bg-muted/40"
              />
            ),
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <SummaryCard
            title="Total Orders"
            value={orders.length}
            description="All orders received"
            icon={ShoppingCart}
            active={tab === 'all'}
            onClick={() => setTab('all')}
          />

          <SummaryCard
            title="Pending"
            value={pendingCount}
            description="Awaiting confirmation"
            icon={Clock3}
            active={tab === 'pending'}
            onClick={() =>
              setTab('pending')
            }
          />

          <SummaryCard
            title="In Progress"
            value={inProgressCount}
            description="Being fulfilled"
            icon={PackageCheck}
            active={[
              'confirmed',
              'packed',
              'ready',
              'dispatched',
              'delivered',
            ].includes(tab)}
            onClick={() =>
              setTab('confirmed')
            }
          />

          <SummaryCard
            title="Completed"
            value={completedCount}
            description="Successfully completed"
            icon={CheckCircle2}
            active={tab === 'completed'}
            onClick={() =>
              setTab('completed')
            }
          />

          <SummaryCard
            title="Cancelled"
            value={cancelledCount}
            description="Cancelled orders"
            icon={Ban}
            active={tab === 'cancelled'}
            onClick={() =>
              setTab('cancelled')
            }
          />
        </div>
      )}

      <div className="flex min-w-0 flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="-mx-1 min-w-0 overflow-x-auto px-1 pb-1">
          <Tabs
            value={tab}
            onValueChange={(value) =>
              setTab(value as OrdersTab)
            }
            className="w-max min-w-full"
          >
            <TabsList className="inline-flex h-auto min-w-max">
              {TABS.map((item) => (
                <TabsTrigger
                  key={item.value}
                  value={item.value}
                  className="gap-1.5 whitespace-nowrap px-3 text-xs sm:px-4 sm:text-sm"
                >
                  <span>{item.label}</span>

                  <span className="rounded-full bg-background/80 px-1.5 py-0.5 text-[10px] text-muted-foreground shadow-sm">
                    {getTabCount(item.value)}
                  </span>
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>

        <div className="relative w-full shrink-0 xl:w-80">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />

          <Input
            value={search}
            onChange={(event) =>
              setSearch(event.target.value)
            }
            placeholder="Search order, customer, phone or email…"
            className="h-10 w-full pl-9 pr-10"
          />

          {search && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Clear search"
              className="absolute right-1 top-1/2 size-8 -translate-y-1/2 text-muted-foreground"
              onClick={() => setSearch('')}
            >
              <X className="size-4" />
            </Button>
          )}
        </div>
      </div>

      {ordersQ.isLoading ? (
        <TableSkeleton rows={8} />
      ) : visible.length === 0 ? (
        <EmptyState
          icon={ShoppingCart}
          title={
            search || tab !== 'all'
              ? 'No matching orders'
              : 'No orders yet'
          }
          description={
            search || tab !== 'all'
              ? 'Try a different filter or search term.'
              : 'Orders appear here as soon as customers buy from your store.'
          }
          action={
            search || tab !== 'all' ? (
              <Button
                variant="outline"
                onClick={() => {
                  setSearch('')
                  setTab('all')
                }}
              >
                Clear filters
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          {/* Desktop and tablet table */}
          <div className="hidden min-w-0 overflow-hidden rounded-xl border bg-background md:block">
            <div className="max-h-[560px] overflow-auto">
              <Table className="min-w-[980px]">
                <TableHeader className="sticky top-0 z-20 bg-background shadow-sm">
                  <TableRow className="bg-muted/30 hover:bg-muted/30">
                    <TableHead className="min-w-[150px]">
                      Order
                    </TableHead>

                    <TableHead className="min-w-[190px]">
                      Date
                    </TableHead>

                    <TableHead className="min-w-[190px]">
                      Customer
                    </TableHead>

                    <TableHead className="min-w-[80px]">
                      Items
                    </TableHead>

                    <TableHead className="min-w-[130px]">
                      Total
                    </TableHead>

                    <TableHead className="min-w-[130px]">
                      Payment
                    </TableHead>

                    <TableHead className="min-w-[130px]">
                      Status
                    </TableHead>
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {visible.map((order) => (
                    <TableRow
                      key={order.id}
                      tabIndex={0}
                      role="link"
                      className="cursor-pointer transition-colors hover:bg-primary/[0.04] focus-visible:bg-primary/[0.05] focus-visible:outline-none"
                      onClick={() =>
                        openOrder(order.id)
                      }
                      onKeyDown={(event) => {
                        if (
                          event.key ===
                            'Enter' ||
                          event.key === ' '
                        ) {
                          event.preventDefault()
                          openOrder(order.id)
                        }
                      }}
                    >
                      <TableCell>
                        <Link
                          to={`/merchant/orders/${order.id}`}
                          className="inline-block max-w-[160px] truncate font-semibold text-primary hover:underline"
                          title={
                            order.orderNumber
                          }
                          onClick={(event) =>
                            event.stopPropagation()
                          }
                        >
                          {order.orderNumber}
                        </Link>
                      </TableCell>

                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {formatDate(
                          order.createdAt,
                          'MMM D, YYYY h:mm A',
                        )}
                      </TableCell>

                      <TableCell>
                        <div className="flex min-w-0 items-center gap-3">
                          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                            {order.customerName
                              ?.trim()
                              .charAt(0)
                              .toUpperCase() ||
                              '?'}
                          </span>

                          <div className="min-w-0">
                            <p
                              className="max-w-[160px] truncate font-medium"
                              title={
                                order.customerName
                              }
                            >
                              {
                                order.customerName
                              }
                            </p>

                            <p
                              className="mt-0.5 max-w-[160px] truncate text-xs text-muted-foreground"
                              title={
                                order.customerPhone
                              }
                            >
                              {
                                order.customerPhone
                              }
                            </p>
                          </div>
                        </div>
                      </TableCell>

                      <TableCell>
                        {getItemCount(order)}
                      </TableCell>

                      <TableCell className="whitespace-nowrap font-semibold">
                        {formatCurrency(
                          order.total,
                        )}
                      </TableCell>

                      <TableCell>
                        <span
                          className={cn(
                            'inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium',
                            order.cashReceived
                              ? 'bg-success/10 text-success'
                              : 'bg-muted text-muted-foreground',
                          )}
                        >
                          {order.cashReceived
                            ? 'COD Received'
                            : 'COD Due'}
                        </span>
                      </TableCell>

                      <TableCell>
                        <OrderStatusBadge
                          status={order.status}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>

          {/* Mobile cards */}
          <div className="space-y-3 md:hidden">
            {visible.map((order) => (
              <Link
                key={order.id}
                to={`/merchant/orders/${order.id}`}
                className="block"
              >
                <Card className="p-4 transition-colors hover:border-primary/30 hover:bg-primary/[0.02]">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-primary">
                        {order.orderNumber}
                      </p>

                      <p className="mt-1 text-xs text-muted-foreground">
                        {formatDate(
                          order.createdAt,
                          'MMM D, YYYY h:mm A',
                        )}
                      </p>
                    </div>

                    <OrderStatusBadge
                      status={order.status}
                    />
                  </div>

                  <div className="mt-4 flex items-center gap-3">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 font-semibold text-primary">
                      {order.customerName
                        ?.trim()
                        .charAt(0)
                        .toUpperCase() || '?'}
                    </span>

                    <div className="min-w-0">
                      <p className="truncate font-medium">
                        {order.customerName}
                      </p>

                      <p className="truncate text-xs text-muted-foreground">
                        {order.customerPhone}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-3 gap-3 border-t pt-4 text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground">
                        Items
                      </p>

                      <p className="mt-1 font-semibold">
                        {getItemCount(order)}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs text-muted-foreground">
                        Payment
                      </p>

                      <p className="mt-1 font-medium">
                        {order.cashReceived
                          ? 'COD Received'
                          : 'COD Due'}
                      </p>
                    </div>

                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">
                        Total
                      </p>

                      <p className="mt-1 font-semibold">
                        {formatCurrency(
                          order.total,
                        )}
                      </p>
                    </div>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        </>
      )}

      {!ordersQ.isLoading &&
        visible.length > 0 && (
          <p className="text-sm text-muted-foreground">
            Showing {visible.length} of{' '}
            {orders.length}{' '}
            {orders.length === 1
              ? 'order'
              : 'orders'}
          </p>
        )}
    </div>
  )
}