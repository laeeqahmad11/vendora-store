import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { limit, orderBy } from 'firebase/firestore'
import dayjs from 'dayjs'
import { Ban, CheckCircle2, Clock, Download, Search, ShoppingCart } from 'lucide-react'
import { PageHeader } from '@/layouts/dashboard-layout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { TableSkeleton, StatCardSkeleton } from '@/components/ui/skeleton'
import { EmptyState, Separator, StatCard } from '@/components/ui/misc'
import { storesService } from '@/services/stores.service'
import { useRealtimeCollection } from '@/hooks/use-realtime'
import { LiveBadge } from '@/components/shared/live-badge'
import { COLLECTIONS, ORDER_STATUS_COLORS, ORDER_STATUS_LABELS } from '@/lib/constants'
import { cn, formatCurrency, formatDate, formatNumber } from '@/lib/utils'
import type { Order, OrderStatus } from '@/types'
import { downloadCSV } from '../components/csv'

const ALL_STATUSES = Object.keys(ORDER_STATUS_LABELS) as OrderStatus[]

export default function OrdersMonitorPage() {
  const [status, setStatus] = React.useState<string>('all')
  const [storeId, setStoreId] = React.useState<string>('all')
  const [search, setSearch] = React.useState('')
  const [selected, setSelected] = React.useState<Order | null>(null)

  // Live subscription — every order placed anywhere on the platform streams in
  const ordersQ = useRealtimeCollection<Order>(
    COLLECTIONS.orders,
    [orderBy('createdAt', 'desc'), limit(500)],
    [],
  )
  const storesQ = useQuery({ queryKey: ['admin-stores'], queryFn: () => storesService.listAll() })

  const orders = ordersQ.data ?? []
  const filtered = orders.filter(
    (o) =>
      (status === 'all' || o.status === status) &&
      (storeId === 'all' || o.storeId === storeId) &&
      (!search.trim() || o.orderNumber.toLowerCase().includes(search.trim().toLowerCase())),
  )

  const counts = {
    total: orders.length,
    pending: orders.filter((o) => o.status === 'pending').length,
    completed: orders.filter((o) => o.status === 'completed').length,
    cancelled: orders.filter((o) => o.status === 'cancelled').length,
  }

  const exportCSV = () =>
    downloadCSV(
      `orders-${dayjs().format('YYYY-MM-DD')}.csv`,
      ['Order', 'Date', 'Customer', 'Store', 'Status', 'Items', 'Subtotal', 'Discount', 'Shipping', 'Total', 'Cash received'],
      filtered.map((o) => [
        o.orderNumber,
        dayjs(o.createdAt).format('YYYY-MM-DD HH:mm'),
        o.customerName,
        o.storeName,
        ORDER_STATUS_LABELS[o.status],
        o.items.reduce((s, i) => s + i.quantity, 0),
        o.subtotal,
        o.discount,
        o.shippingFee,
        o.total,
        o.cashReceived ? 'yes' : 'no',
      ]),
    )

  return (
    <div>
      <PageHeader
        title="Orders"
        description="Monitor every order on the platform. Fulfilment is managed by merchants."
        actions={
          <>
            <LiveBadge className="mr-1" />
            <Button variant="outline" onClick={exportCSV} disabled={filtered.length === 0}>
              <Download /> Export CSV
            </Button>
          </>
        }
      />

      {ordersQ.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <StatCardSkeleton key={i} />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard title="Total Orders" value={formatNumber(counts.total)} icon={ShoppingCart} />
          <StatCard title="Pending" value={formatNumber(counts.pending)} icon={Clock} />
          <StatCard title="Completed" value={formatNumber(counts.completed)} icon={CheckCircle2} />
          <StatCard title="Cancelled" value={formatNumber(counts.cancelled)} icon={Ban} />
        </div>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search order number…"
            className="pl-9"
          />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {ALL_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {ORDER_STATUS_LABELS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={storeId} onValueChange={setStoreId}>
          <SelectTrigger className="w-full sm:w-52">
            <SelectValue placeholder="Store" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All stores</SelectItem>
            {(storesQ.data ?? []).map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="mt-4">
        {ordersQ.isLoading ? (
          <TableSkeleton rows={8} />
        ) : filtered.length === 0 ? (
          <EmptyState icon={ShoppingCart} title="No orders match" description="Try adjusting the filters." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Store</TableHead>
                <TableHead>Items</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((o) => (
                <TableRow key={o.id} className="cursor-pointer" onClick={() => setSelected(o)}>
                  <TableCell className="font-medium">{o.orderNumber}</TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">{formatDate(o.createdAt)}</TableCell>
                  <TableCell>{o.customerName}</TableCell>
                  <TableCell>{o.storeName}</TableCell>
                  <TableCell>{o.items.reduce((s, i) => s + i.quantity, 0)}</TableCell>
                  <TableCell className="whitespace-nowrap font-semibold">{formatCurrency(o.total)}</TableCell>
                  <TableCell>
                    <OrderStatusBadge status={o.status} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {selected && <OrderDetailDialog order={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}

function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return (
    <span
      className={cn(
        'inline-flex whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium',
        ORDER_STATUS_COLORS[status],
      )}
    >
      {ORDER_STATUS_LABELS[status]}
    </span>
  )
}

function OrderDetailDialog({ order, onClose }: { order: Order; onClose: () => void }) {
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            {order.orderNumber} <OrderStatusBadge status={order.status} />
          </DialogTitle>
          <DialogDescription>
            {order.storeName} · placed {formatDate(order.createdAt, 'MMM D, YYYY h:mm A')} · cash on delivery
            {order.cashReceived ? ' (received)' : ''}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
          <p>
            <span className="text-muted-foreground">Customer:</span> {order.customerName}
          </p>
          <p>
            <span className="text-muted-foreground">Email:</span> {order.customerEmail}
          </p>
          <p>
            <span className="text-muted-foreground">Phone:</span> {order.customerPhone}
          </p>
          <p className="sm:col-span-2">
            <span className="text-muted-foreground">Ship to:</span> {order.shippingAddress.fullName},{' '}
            {order.shippingAddress.line1}
            {order.shippingAddress.line2 ? `, ${order.shippingAddress.line2}` : ''}, {order.shippingAddress.city},{' '}
            {order.shippingAddress.province} {order.shippingAddress.postalCode}, {order.shippingAddress.country}
          </p>
          {order.specialInstructions && (
            <p className="sm:col-span-2">
              <span className="text-muted-foreground">Instructions:</span> {order.specialInstructions}
            </p>
          )}
          {order.cancelReason && (
            <p className="sm:col-span-2 text-destructive">
              <span className="text-muted-foreground">Cancel reason:</span> {order.cancelReason}
            </p>
          )}
        </div>

        <Separator />

        <ul className="space-y-3">
          {order.items.map((item, i) => (
            <li key={`${item.productId}-${i}`} className="flex items-center gap-3 text-sm">
              {item.imageUrl ? (
                <img src={item.imageUrl} alt={item.name} className="size-10 rounded-lg border object-cover" />
              ) : (
                <span className="size-10 rounded-lg border bg-muted" />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{item.name}</p>
                {item.variant && (
                  <p className="text-xs text-muted-foreground">
                    {Object.entries(item.variant)
                      .map(([k, v]) => `${k}: ${v}`)
                      .join(' · ')}
                  </p>
                )}
              </div>
              <span className="whitespace-nowrap text-muted-foreground">
                {item.quantity} × {formatCurrency(item.price)}
              </span>
              <span className="w-20 text-right font-medium">{formatCurrency(item.price * item.quantity)}</span>
            </li>
          ))}
        </ul>

        <Separator />

        <div className="ml-auto w-full max-w-56 space-y-1 text-sm">
          <p className="flex justify-between">
            <span className="text-muted-foreground">Subtotal</span> {formatCurrency(order.subtotal)}
          </p>
          {order.discount > 0 && (
            <p className="flex justify-between text-success">
              <span>Discount{order.couponCode ? ` (${order.couponCode})` : ''}</span> −{formatCurrency(order.discount)}
            </p>
          )}
          <p className="flex justify-between">
            <span className="text-muted-foreground">Shipping</span> {formatCurrency(order.shippingFee)}
          </p>
          {order.tax > 0 && (
            <p className="flex justify-between">
              <span className="text-muted-foreground">Tax</span> {formatCurrency(order.tax)}
            </p>
          )}
          <p className="flex justify-between border-t pt-1 font-semibold">
            <span>Total</span> {formatCurrency(order.total)}
          </p>
        </div>

        <Separator />

        <div>
          <p className="mb-2 text-sm font-semibold">Timeline</p>
          <ul className="space-y-2">
            {[...order.timeline]
              .sort((a, b) => b.at - a.at)
              .map((entry, i) => (
                <li key={i} className="flex items-start gap-3 text-sm">
                  <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />
                  <div>
                    <p className="font-medium capitalize">{entry.status.replace(/_/g, ' ')}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(entry.at, 'MMM D, YYYY h:mm A')}
                      {entry.note ? ` — ${entry.note}` : ''}
                    </p>
                  </div>
                </li>
              ))}
          </ul>
        </div>
      </DialogContent>
    </Dialog>
  )
}
