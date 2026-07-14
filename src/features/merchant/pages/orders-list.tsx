import * as React from 'react'
import { Link } from 'react-router-dom'
import { orderBy, where } from 'firebase/firestore'
import { Search, ShoppingCart } from 'lucide-react'
import { Input } from '@/components/ui/input'
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
import { formatCurrency, formatDate } from '@/lib/utils'
import type { Order, OrderStatus } from '@/types'
import {
  ErrorState,
  OrderStatusBadge,
  useMerchant,
} from '../components/common'

const TABS: { value: OrderStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'packed', label: 'Packed' },
  { value: 'ready', label: 'Ready' },
  { value: 'dispatched', label: 'Dispatched' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'completed', label: 'Completed' },
  { value: 'refund_requested', label: 'Refunds' },
  { value: 'cancelled', label: 'Cancelled' },
]

export default function OrdersListPage() {
  const { store } = useMerchant()
  const [tab, setTab] = React.useState<OrderStatus | 'all'>('all')
  const [search, setSearch] = React.useState('')

  // Live subscription — new orders and status changes appear without refresh
  const ordersQ = useRealtimeCollection<Order>(
    COLLECTIONS.orders,
    [
      where('storeId', '==', store.id),
      orderBy('createdAt', 'desc'),
    ],
    [store.id],
  )

  const orders = ordersQ.data ?? []

  const visible = React.useMemo(() => {
    let items =
      tab === 'all'
        ? orders
        : orders.filter((order) => order.status === tab)

    const q = search.trim().toLowerCase()

    if (q) {
      items = items.filter(
        (order) =>
          order.orderNumber.toLowerCase().includes(q) ||
          order.customerName.toLowerCase().includes(q),
      )
    }

    return items
  }, [orders, tab, search])

  if (ordersQ.isError) {
    return <ErrorState onRetry={() => window.location.reload()} />
  }

  return (
    <div className="min-w-0 space-y-5">
      <PageHeader
        title="Orders"
        description="Track and fulfil your customer orders."
        actions={<LiveBadge />}
      />

      <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="-mx-1 min-w-0 overflow-x-auto px-1 pb-1">
          <Tabs
            value={tab}
            onValueChange={(value) =>
              setTab(value as OrderStatus | 'all')
            }
            className="w-max min-w-full"
          >
            <TabsList className="inline-flex h-auto min-w-max">
              {TABS.map((item) => (
                <TabsTrigger
                  key={item.value}
                  value={item.value}
                  className="whitespace-nowrap px-3 text-xs sm:px-4 sm:text-sm"
                >
                  {item.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>

        <div className="relative w-full shrink-0 lg:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />

          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search order # or customer…"
            className="h-10 w-full pl-9"
          />
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
        />
      ) : (
        <div className="min-w-0 overflow-hidden rounded-xl border bg-background">
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
                    className="transition-colors hover:bg-primary/[0.03]"
                  >
                    <TableCell>
                      <Link
                        to={`/merchant/orders/${order.id}`}
                        className="inline-block max-w-[160px] truncate font-semibold text-primary hover:underline"
                        title={order.orderNumber}
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
                      <div className="min-w-0">
                        <p
                          className="max-w-[200px] truncate font-medium"
                          title={order.customerName}
                        >
                          {order.customerName}
                        </p>

                        <p
                          className="mt-0.5 max-w-[200px] truncate text-xs text-muted-foreground"
                          title={order.customerPhone}
                        >
                          {order.customerPhone}
                        </p>
                      </div>
                    </TableCell>

                    <TableCell>
                      {order.items.reduce(
                        (sum, item) => sum + item.quantity,
                        0,
                      )}
                    </TableCell>

                    <TableCell className="whitespace-nowrap font-semibold">
                      {formatCurrency(order.total)}
                    </TableCell>

                    <TableCell>
                      <span
                        className={
                          order.cashReceived
                            ? 'inline-flex whitespace-nowrap rounded-full bg-success/10 px-2.5 py-1 text-xs font-medium text-success'
                            : 'inline-flex whitespace-nowrap rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground'
                        }
                      >
                        COD ·{' '}
                        {order.cashReceived ? 'received' : 'due'}
                      </span>
                    </TableCell>

                    <TableCell>
                      <OrderStatusBadge status={order.status} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  )
}