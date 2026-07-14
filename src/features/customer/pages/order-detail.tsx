import * as React from 'react'
import { Link, useParams } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import {
  ArrowLeft,
  Ban,
  Package,
  Printer,
  Undo2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Textarea } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { EmptyState, Separator } from '@/components/ui/misc'
import { SEO } from '@/components/shared/seo'
import { ordersService } from '@/services/orders.service'
import { useAuthStore } from '@/stores/auth-store'
import { useRealtimeDoc } from '@/hooks/use-realtime'
import { LiveBadge } from '@/components/shared/live-badge'
import {
  APP_NAME,
  COLLECTIONS,
  ORDER_STATUS_COLORS,
  ORDER_STATUS_LABELS,
} from '@/lib/constants'
import {
  cn,
  formatCurrency,
  formatDate,
  getErrorMessage,
} from '@/lib/utils'
import type {
  Order,
  OrderTimelineEntry,
} from '@/types'

const PRINT_STYLES = `
@media print {
  body * {
    visibility: hidden;
  }

  .invoice-print,
  .invoice-print * {
    visibility: visible;
  }

  .invoice-print {
    position: absolute;
    inset: 0;
    display: block !important;
    padding: 24px;
  }
}
`

function timelineLabel(entry: OrderTimelineEntry) {
  if (entry.status === 'cash_received') {
    return 'Cash received'
  }

  return ORDER_STATUS_LABELS[entry.status]
}

function Timeline({
  entries,
}: {
  entries: OrderTimelineEntry[]
}) {
  const sorted = [...entries].sort(
    (a, b) => a.at - b.at,
  )

  return (
    <ol className="relative space-y-6 border-l pl-6">
      {sorted.map((entry, index) => {
        const isLast =
          index === sorted.length - 1

        return (
          <li
            key={`${entry.status}-${entry.at}`}
            className="relative min-w-0"
          >
            <span
              className={cn(
                'absolute -left-[1.85rem] top-0.5 size-3 rounded-full border-2 border-background',
                isLast
                  ? 'bg-primary ring-4 ring-primary/20'
                  : 'bg-muted-foreground/40',
              )}
              aria-hidden="true"
            />

            <p
              className={cn(
                'break-words text-sm font-medium',
                isLast && 'text-primary',
              )}
            >
              {timelineLabel(entry)}
            </p>

            <p className="mt-0.5 break-words text-xs leading-5 text-muted-foreground">
              {formatDate(
                entry.at,
                'MMM D, YYYY h:mm A',
              )}
            </p>

            {entry.note && (
              <p className="mt-1 break-words text-xs leading-5 text-muted-foreground">
                {entry.note}
              </p>
            )}
          </li>
        )
      })}
    </ol>
  )
}

function Invoice({ order }: { order: Order }) {
  return (
    <div className="invoice-print hidden">
      <div
        style={{
          fontFamily: 'system-ui, sans-serif',
          color: '#111',
        }}
      >
        <h1
          style={{
            fontSize: 22,
            fontWeight: 700,
          }}
        >
          {APP_NAME} — Invoice
        </h1>

        <p
          style={{
            fontSize: 13,
            marginTop: 4,
          }}
        >
          Order {order.orderNumber} ·{' '}
          {formatDate(order.createdAt)}
        </p>

        <p style={{ fontSize: 13 }}>
          Sold by: {order.storeName}
        </p>

        <h2
          style={{
            fontSize: 14,
            fontWeight: 700,
            marginTop: 16,
          }}
        >
          Deliver to
        </h2>

        <p style={{ fontSize: 13 }}>
          {order.shippingAddress.fullName} ·{' '}
          {order.shippingAddress.phone}
          <br />

          {order.shippingAddress.line1}

          {order.shippingAddress.line2
            ? `, ${order.shippingAddress.line2}`
            : ''}

          <br />

          {order.shippingAddress.city},{' '}
          {order.shippingAddress.province}{' '}
          {order.shippingAddress.postalCode},{' '}
          {order.shippingAddress.country}
        </p>

        <table
          style={{
            width: '100%',
            marginTop: 16,
            borderCollapse: 'collapse',
            fontSize: 13,
          }}
        >
          <thead>
            <tr>
              <th
                style={{
                  textAlign: 'left',
                  borderBottom: '1px solid #999',
                  padding: '6px 0',
                }}
              >
                Item
              </th>

              <th
                style={{
                  textAlign: 'right',
                  borderBottom: '1px solid #999',
                  padding: '6px 0',
                }}
              >
                Qty
              </th>

              <th
                style={{
                  textAlign: 'right',
                  borderBottom: '1px solid #999',
                  padding: '6px 0',
                }}
              >
                Price
              </th>

              <th
                style={{
                  textAlign: 'right',
                  borderBottom: '1px solid #999',
                  padding: '6px 0',
                }}
              >
                Total
              </th>
            </tr>
          </thead>

          <tbody>
            {order.items.map((item, index) => (
              <tr key={index}>
                <td
                  style={{
                    padding: '6px 0',
                    borderBottom:
                      '1px solid #eee',
                  }}
                >
                  {item.name}

                  {item.variant
                    ? ` (${Object.values(
                        item.variant,
                      ).join(', ')})`
                    : ''}
                </td>

                <td
                  style={{
                    textAlign: 'right',
                    borderBottom:
                      '1px solid #eee',
                  }}
                >
                  {item.quantity}
                </td>

                <td
                  style={{
                    textAlign: 'right',
                    borderBottom:
                      '1px solid #eee',
                  }}
                >
                  {formatCurrency(item.price)}
                </td>

                <td
                  style={{
                    textAlign: 'right',
                    borderBottom:
                      '1px solid #eee',
                  }}
                >
                  {formatCurrency(
                    item.price * item.quantity,
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div
          style={{
            marginTop: 12,
            fontSize: 13,
            textAlign: 'right',
          }}
        >
          <p>
            Subtotal:{' '}
            {formatCurrency(order.subtotal)}
          </p>

          {order.discount > 0 && (
            <p>
              Discount
              {order.couponCode
                ? ` (${order.couponCode})`
                : ''}
              : −
              {formatCurrency(order.discount)}
            </p>
          )}

          <p>
            Shipping:{' '}
            {order.shippingFee
              ? formatCurrency(order.shippingFee)
              : 'Collected at delivery'}
          </p>

          <p
            style={{
              fontWeight: 700,
              fontSize: 15,
              marginTop: 4,
            }}
          >
            Total: {formatCurrency(order.total)}
          </p>

          <p style={{ marginTop: 8 }}>
            Payment method: Cash on Delivery
          </p>
        </div>
      </div>
    </div>
  )
}

export default function OrderDetailPage() {
  const { orderId = '' } = useParams()

  const {
    firebaseUser,
    profile,
  } = useAuthStore()

  const queryClient = useQueryClient()

  const [cancelOpen, setCancelOpen] =
    React.useState(false)

  const [returnOpen, setReturnOpen] =
    React.useState(false)

  const [returnReason, setReturnReason] =
    React.useState('')

  // Live subscription — the tracking timeline advances in real time
  // as the merchant updates fulfilment status.
  const {
    data: order,
    isLoading,
  } = useRealtimeDoc<Order>(
    COLLECTIONS.orders,
    orderId,
  )

  const actor = {
    id: firebaseUser?.uid ?? '',
    name:
      profile?.displayName ?? 'Customer',
    role: 'customer' as const,
  }

  const cancel = useMutation({
    mutationFn: () =>
      ordersService.cancel(
        order!,
        actor,
        'Cancelled by customer',
      ),

    onSuccess: () => {
      toast.success('Order cancelled')

      void queryClient.invalidateQueries({
        queryKey: ['order', orderId],
      })

      void queryClient.invalidateQueries({
        queryKey: ['orders'],
      })
    },

    onError: (error) =>
      toast.error(getErrorMessage(error)),
  })

  const requestReturn = useMutation({
    mutationFn: () =>
      ordersService.requestReturn(
        order!,
        actor,
        returnReason.trim(),
      ),

    onSuccess: () => {
      toast.success(
        'Return requested — the merchant will contact you.',
      )

      setReturnOpen(false)
      setReturnReason('')

      void queryClient.invalidateQueries({
        queryKey: ['order', orderId],
      })
    },

    onError: (error) =>
      toast.error(getErrorMessage(error)),
  })

  if (isLoading) {
    return (
      <div className="min-w-0 space-y-4 overflow-hidden">
        <Skeleton className="h-8 w-48 max-w-full sm:w-64" />
        <Skeleton className="h-40 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    )
  }

  if (
    !order ||
    (firebaseUser &&
      order.customerId !== firebaseUser.uid)
  ) {
    return (
      <EmptyState
        icon={Package}
        title="Order not found"
        description="We couldn't find this order in your account."
        action={
          <Button asChild>
            <Link to="/account/orders">
              Back to orders
            </Link>
          </Button>
        }
      />
    )
  }

  const canCancel = [
    'pending',
    'confirmed',
  ].includes(order.status)

  const canReturn = [
    'delivered',
    'completed',
  ].includes(order.status)

  return (
    <div className="min-w-0 overflow-hidden">
      <SEO
        title={`Order ${order.orderNumber}`}
      />

      <style>{PRINT_STYLES}</style>

      <Link
        to="/account/orders"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4 shrink-0" />
        All orders
      </Link>

      <div className="mt-4 flex min-w-0 flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h2 className="min-w-0 break-words text-xl font-bold tracking-tight sm:text-2xl">
              {order.orderNumber}
            </h2>

            <Badge
              className={
                ORDER_STATUS_COLORS[
                  order.status
                ]
              }
            >
              {
                ORDER_STATUS_LABELS[
                  order.status
                ]
              }
            </Badge>

            <LiveBadge />
          </div>

          <p className="mt-1 break-words text-xs leading-5 text-muted-foreground">
            Placed{' '}
            {formatDate(
              order.createdAt,
              'MMM D, YYYY h:mm A',
            )}
            <span aria-hidden="true"> · </span>
            Sold by {order.storeName}
          </p>
        </div>

        <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full sm:w-auto"
            onClick={() => window.print()}
          >
            <Printer className="size-4" />
            Print invoice
          </Button>

          {canCancel && (
            <Button
              type="button"
              variant="destructive"
              size="sm"
              className="w-full sm:w-auto"
              onClick={() =>
                setCancelOpen(true)
              }
            >
              <Ban className="size-4" />
              Cancel order
            </Button>
          )}

          {canReturn && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="col-span-2 w-full sm:w-auto"
              onClick={() =>
                setReturnOpen(true)
              }
            >
              <Undo2 className="size-4" />
              Request return
            </Button>
          )}
        </div>
      </div>

      <div className="mt-6 grid min-w-0 gap-5 lg:grid-cols-3 lg:gap-6">
        <div className="min-w-0 space-y-5 lg:col-span-2 lg:space-y-6">
          {/* Items */}
          <Card className="min-w-0 overflow-hidden divide-y px-4 sm:px-5">
            {order.items.map(
              (item, index) => (
                <div
                  key={`${item.productId}-${index}`}
                  className="grid min-w-0 grid-cols-[56px_minmax(0,1fr)] gap-3 py-4 sm:grid-cols-[64px_minmax(0,1fr)_auto] sm:items-center sm:gap-4"
                >
                  <div className="size-14 shrink-0 overflow-hidden rounded-lg border bg-muted sm:size-16">
                    {item.imageUrl ? (
                      <img
                        src={item.imageUrl}
                        alt={item.name}
                        className="size-full object-cover"
                      />
                    ) : (
                      <div className="flex size-full items-center justify-center text-muted-foreground">
                        <Package className="size-5 opacity-40" />
                      </div>
                    )}
                  </div>

                  <div className="min-w-0">
                    <p className="break-words text-sm font-medium">
                      {item.name}
                    </p>

                    {item.variant && (
                      <p className="mt-1 break-words text-xs leading-5 text-muted-foreground">
                        {Object.entries(
                          item.variant,
                        )
                          .map(
                            ([key, value]) =>
                              `${key}: ${value}`,
                          )
                          .join(' · ')}
                      </p>
                    )}

                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatCurrency(
                        item.price,
                      )}{' '}
                      × {item.quantity}
                    </p>

                    <p className="mt-2 text-sm font-semibold sm:hidden">
                      {formatCurrency(
                        item.price *
                          item.quantity,
                      )}
                    </p>
                  </div>

                  <p className="hidden whitespace-nowrap text-right text-sm font-semibold sm:block">
                    {formatCurrency(
                      item.price *
                        item.quantity,
                    )}
                  </p>
                </div>
              ),
            )}
          </Card>

          {/* Totals */}
          <Card className="min-w-0 overflow-hidden p-4 sm:p-5">
            <dl className="min-w-0 space-y-3 text-sm">
              <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-4">
                <dt className="text-muted-foreground">
                  Subtotal
                </dt>

                <dd className="whitespace-nowrap text-right font-medium">
                  {formatCurrency(
                    order.subtotal,
                  )}
                </dd>
              </div>

              {order.discount > 0 && (
                <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-4 text-success">
                  <dt className="break-words">
                    Discount
                    {order.couponCode
                      ? ` (${order.couponCode})`
                      : ''}
                  </dt>

                  <dd className="whitespace-nowrap text-right font-medium">
                    −
                    {formatCurrency(
                      order.discount,
                    )}
                  </dd>
                </div>
              )}

              <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-start gap-4">
                <dt className="text-muted-foreground">
                  Shipping
                </dt>

                <dd className="break-words text-right text-xs leading-5 text-muted-foreground">
                  {order.shippingFee
                    ? formatCurrency(
                        order.shippingFee,
                      )
                    : 'Collected at delivery'}
                </dd>
              </div>

              {order.tax > 0 && (
                <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-4">
                  <dt className="text-muted-foreground">
                    Tax
                  </dt>

                  <dd className="whitespace-nowrap text-right font-medium">
                    {formatCurrency(
                      order.tax,
                    )}
                  </dd>
                </div>
              )}
            </dl>

            <Separator className="my-4" />

            <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-4 font-bold">
              <span>Total (COD)</span>

              <span className="whitespace-nowrap text-right">
                {formatCurrency(order.total)}
              </span>
            </div>
          </Card>

          {/* Shipping address */}
          <Card className="min-w-0 overflow-hidden p-4 sm:p-5">
            <h3 className="text-sm font-semibold">
              Shipping address
            </h3>

            <p className="mt-2 break-words text-sm leading-6 text-muted-foreground">
              {order.shippingAddress.fullName}
              <span aria-hidden="true"> · </span>
              {order.shippingAddress.phone}
              <br />

              {order.shippingAddress.line1}

              {order.shippingAddress.line2
                ? `, ${order.shippingAddress.line2}`
                : ''}

              <br />

              {order.shippingAddress.city},{' '}
              {
                order.shippingAddress
                  .province
              }{' '}
              {
                order.shippingAddress
                  .postalCode
              }
              ,{' '}
              {
                order.shippingAddress
                  .country
              }
            </p>

            {order.specialInstructions && (
              <p className="mt-3 break-words text-xs leading-5 text-muted-foreground">
                <span className="font-medium text-foreground">
                  Instructions:
                </span>{' '}
                {order.specialInstructions}
              </p>
            )}

            {order.giftNote && (
              <p className="mt-2 break-words text-xs leading-5 text-muted-foreground">
                <span className="font-medium text-foreground">
                  Gift note:
                </span>{' '}
                {order.giftNote}
              </p>
            )}
          </Card>
        </div>

        {/* Timeline */}
        <Card className="min-w-0 overflow-hidden p-4 sm:p-5 lg:h-fit">
          <h3 className="mb-5 text-sm font-semibold">
            Order timeline
          </h3>

          <Timeline entries={order.timeline} />
        </Card>
      </div>

      <Invoice order={order} />

      <ConfirmDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title="Cancel this order?"
        description={`Order ${order.orderNumber} will be cancelled and the items returned to stock. This cannot be undone.`}
        confirmLabel="Cancel order"
        destructive
        onConfirm={() =>
          cancel
            .mutateAsync()
            .then(() => undefined)
        }
      />

      <Dialog
        open={returnOpen}
        onOpenChange={setReturnOpen}
      >
        <DialogContent className="max-h-[90vh] w-[calc(100%-2rem)] max-w-md overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Request a return
            </DialogTitle>

            <DialogDescription>
              Tell the merchant why you'd like
              to return this order. They'll
              review your request and get in
              touch.
            </DialogDescription>
          </DialogHeader>

          <Textarea
            rows={5}
            value={returnReason}
            onChange={(event) =>
              setReturnReason(
                event.target.value,
              )
            }
            placeholder="Reason for return (e.g. wrong size, damaged item)…"
          />

          <DialogFooter className="grid gap-2 sm:flex">
            <Button
              type="button"
              variant="outline"
              className="w-full sm:w-auto"
              onClick={() =>
                setReturnOpen(false)
              }
            >
              Never mind
            </Button>

            <Button
              type="button"
              className="w-full sm:w-auto"
              loading={
                requestReturn.isPending
              }
              onClick={() => {
                if (!returnReason.trim()) {
                  toast.error(
                    'Please provide a reason for the return.',
                  )
                  return
                }

                requestReturn.mutate()
              }}
            >
              Submit request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}