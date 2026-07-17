import * as React from 'react'
import { Link, useParams } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import {
  ArrowLeft,
  Banknote,
  Check,
  Gift,
  MessageSquare,
  Package,
  Printer,
  Undo2,
  XCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/input'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  EmptyState,
  Separator,
  Spinner,
} from '@/components/ui/misc'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { PageHeader } from '@/layouts/dashboard-layout'
import { ordersService } from '@/services/orders.service'
import { useRealtimeDoc } from '@/hooks/use-realtime'
import { LiveBadge } from '@/components/shared/live-badge'
import {
  COLLECTIONS,
  NEXT_ORDER_STATUS,
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
  OrderStatus,
} from '@/types'
import {
  ErrorState,
  OrderStatusBadge,
  useMerchant,
} from '../components/common'

const ADVANCE_LABELS: Partial<Record<OrderStatus, string>> = {
  pending: 'Confirm order',
  confirmed: 'Mark packed',
  packed: 'Mark ready',
  ready: 'Mark dispatched',
  dispatched: 'Mark delivered',
}

function Timeline({ order }: { order: Order }) {
  const entries = [...order.timeline].sort(
    (a, b) => a.at - b.at,
  )

  return (
    <ol className="space-y-0">
      {entries.map((entry, i) => {
        const last = i === entries.length - 1

        return (
          <li
            key={`${entry.status}-${entry.at}`}
            className="relative flex gap-3 pb-6 last:pb-0"
          >
            {!last && (
              <span
                className="absolute left-[11px] top-6 h-full w-px bg-border"
                aria-hidden
              />
            )}

            <span
              className={cn(
                'z-10 flex size-6 shrink-0 items-center justify-center rounded-full border-2',
                last
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-card text-muted-foreground',
              )}
            >
              <Check className="size-3" />
            </span>

            <div className="min-w-0">
              <p className="text-sm font-medium capitalize">
                {entry.status === 'cash_received'
                  ? 'Cash received'
                  : ORDER_STATUS_LABELS[entry.status]}
              </p>

              <p className="text-xs text-muted-foreground">
                {formatDate(
                  entry.at,
                  'MMM D, YYYY h:mm A',
                )}
              </p>

              {entry.note && (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {entry.note}
                </p>
              )}
            </div>
          </li>
        )
      })}
    </ol>
  )
}

export default function OrderDetailPage() {
  const { orderId } = useParams()
  const { actor } = useMerchant()
  const queryClient = useQueryClient()

  // Live subscription — timeline and status update in real time
  const orderQ = useRealtimeDoc<Order>(
    COLLECTIONS.orders,
    orderId,
  )

  const order = orderQ.data

  const [cashConfirmOpen, setCashConfirmOpen] =
    React.useState(false)

  const [cancelOpen, setCancelOpen] =
    React.useState(false)

  const [cancelReason, setCancelReason] =
    React.useState('')

  const [refundAction, setRefundAction] =
    React.useState<'approve' | 'decline' | null>(null)

  // The order document itself is live.
  // Only derived caches need invalidating.
  const refresh = async () => {
    await queryClient.invalidateQueries({
      queryKey: ['merchant-orders'],
    })
  }

  const mutate = useMutation({
    mutationFn: async (
      fn: () => Promise<unknown>,
    ) => fn(),

    onSuccess: async () => {
      toast.success('Order updated')
      await refresh()
    },

    onError: (e) =>
      toast.error(getErrorMessage(e)),
  })

  if (orderQ.isLoading) {
    return <Spinner />
  }

  if (orderQ.isError) {
    return (
      <ErrorState
        onRetry={() => window.location.reload()}
      />
    )
  }

  if (!order) {
    return (
      <EmptyState
        icon={Package}
        title="Order not found"
        description="This order does not exist or was removed."
        action={
          <Button
            asChild
            variant="outline"
          >
            <Link to="/merchant/orders">
              Back to orders
            </Link>
          </Button>
        }
      />
    )
  }

  const nextStatus =
    NEXT_ORDER_STATUS[order.status]

  const canCancel =
    order.status === 'pending' ||
    order.status === 'confirmed'

  return (
    <div className="space-y-6">
      <style>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 8mm;
          }

          html,
          body {
            width: 100% !important;
            height: auto !important;
            margin: 0 !important;
            padding: 0 !important;
            overflow: visible !important;
            background: #ffffff !important;
          }

          header,
          aside,
          nav,
          [role='navigation'],
          .print\:hidden {
            display: none !important;
          }

          body * {
            visibility: hidden !important;
          }

          .merchant-print-invoice,
          .merchant-print-invoice * {
            visibility: visible !important;
          }

          .merchant-print-invoice {
            display: block !important;
            position: fixed !important;
            top: 0 !important;
            left: 0 !important;
            right: 0 !important;
            width: auto !important;
            min-height: 0 !important;
            margin: 0 !important;
            padding: 0 !important;
            overflow: visible !important;
            transform: none !important;
            background: #ffffff !important;
            color: #000000 !important;
            font-size: 11px !important;
            line-height: 1.3 !important;
          }

          .merchant-print-invoice table {
            width: 100% !important;
            border-collapse: collapse !important;
            page-break-inside: auto !important;
          }

          .merchant-print-invoice thead {
            display: table-header-group !important;
          }

          .merchant-print-invoice tr,
          .merchant-print-invoice .invoice-totals,
          .merchant-print-invoice .invoice-notes,
          .merchant-print-invoice .invoice-footer {
            break-inside: avoid !important;
            page-break-inside: avoid !important;
          }
        }
      `}</style>
      {/* =====================================================
          PRINTABLE INVOICE
          This section only appears in print/PDF mode
      ====================================================== */}

      <div className="merchant-print-invoice hidden bg-white text-black print:block">
        {/* Invoice header */}
        <div className="flex items-start justify-between gap-6 border-b border-gray-300 pb-3">
          <div>
            <div className="flex items-center gap-3">
              <div className="flex size-11 items-center justify-center rounded-xl bg-black text-lg font-bold text-white">
                V
              </div>

              <div>
                <p className="text-xl font-bold leading-none">
                  Vendora
                </p>

                <p className="mt-1 text-xs text-gray-500">
                  Multi-Vendor Marketplace
                </p>
              </div>
            </div>

            <h1 className="mt-4 text-3xl font-extrabold tracking-tight">
              Invoice
            </h1>

            <p className="mt-1 text-sm text-gray-600">
              Order {order.orderNumber}
            </p>
          </div>

          <div className="text-right text-sm">
            <p className="font-semibold">
              {order.storeName}
            </p>

            <p className="mt-1 text-gray-600">
              Invoice date
            </p>

            <p className="font-medium">
              {formatDate(
                order.createdAt,
                'MMM D, YYYY',
              )}
            </p>

            <p className="mt-3 text-gray-600">
              Payment method
            </p>

            <p className="font-medium">
              Cash on Delivery
            </p>
          </div>
        </div>

        {/* Customer and order information */}
        <div className="mt-4 grid grid-cols-2 gap-8">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-gray-500">
              Bill to
            </p>

            <p className="mt-2 text-sm font-semibold">
              {order.customerName}
            </p>

            {order.customerEmail && (
              <p className="mt-1 text-sm text-gray-600">
                {order.customerEmail}
              </p>
            )}

            {order.customerPhone && (
              <p className="text-sm text-gray-600">
                {order.customerPhone}
              </p>
            )}

            <p className="mt-2 text-sm leading-6 text-gray-700">
              {order.shippingAddress.line1}

              {order.shippingAddress.line2 && (
                <>
                  <br />
                  {order.shippingAddress.line2}
                </>
              )}

              <br />

              {order.shippingAddress.city},{' '}
              {order.shippingAddress.province}{' '}
              {order.shippingAddress.postalCode}

              <br />

              {order.shippingAddress.country}
            </p>
          </div>

          <div className="text-right">
            <p className="text-xs font-bold uppercase tracking-wider text-gray-500">
              Order details
            </p>

            <div className="mt-2 space-y-1 text-sm">
              <p>
                <span className="text-gray-500">
                  Order:
                </span>{' '}
                <span className="font-semibold">
                  {order.orderNumber}
                </span>
              </p>

              <p>
                <span className="text-gray-500">
                  Status:
                </span>{' '}
                <span className="font-semibold">
                  {ORDER_STATUS_LABELS[order.status]}
                </span>
              </p>

              <p>
                <span className="text-gray-500">
                  Items:
                </span>{' '}
                <span className="font-semibold">
                  {order.items.reduce(
                    (sum, item) =>
                      sum + item.quantity,
                    0,
                  )}
                </span>
              </p>
            </div>
          </div>
        </div>

        {/* Items table */}
        <table className="mt-5 w-full border-collapse text-sm">
          <thead className="bg-gray-100">
            <tr>
              <th className="border-y border-gray-300 px-3 py-2 text-left text-xs font-bold uppercase tracking-wider">
                Item
              </th>

              <th className="border-y border-gray-300 px-3 py-2 text-right text-xs font-bold uppercase tracking-wider">
                Qty
              </th>

              <th className="border-y border-gray-300 px-3 py-2 text-right text-xs font-bold uppercase tracking-wider">
                Price
              </th>

              <th className="border-y border-gray-300 px-3 py-2 text-right text-xs font-bold uppercase tracking-wider">
                Total
              </th>
            </tr>
          </thead>

          <tbody>
            {order.items.map((item, i) => (
              <tr key={`${item.productId}-${i}`}>
                <td className="border-b border-gray-200 px-3 py-2.5">
                  <p className="font-medium">
                    {item.name}
                  </p>

                  {item.variant && (
                    <p className="mt-1 text-xs text-gray-500">
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

                  {item.sku && (
                    <p className="mt-1 text-xs text-gray-500">
                      SKU: {item.sku}
                    </p>
                  )}
                </td>

                <td className="border-b border-gray-200 px-3 py-2.5 text-right">
                  {item.quantity}
                </td>

                <td className="border-b border-gray-200 px-3 py-2.5 text-right">
                  {formatCurrency(item.price)}
                </td>

                <td className="border-b border-gray-200 px-3 py-2.5 text-right font-semibold">
                  {formatCurrency(
                    item.price * item.quantity,
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totals */}
        <div className="invoice-totals mt-5 ml-auto w-full max-w-sm rounded-lg border border-gray-300 bg-gray-50 p-4 text-sm">
          <div className="space-y-2">
            <p className="flex justify-between gap-4">
              <span className="text-gray-600">
                Subtotal
              </span>

              <span className="font-medium">
                {formatCurrency(order.subtotal)}
              </span>
            </p>

            <p className="flex justify-between gap-4">
              <span className="text-gray-600">
                Discount
                {order.couponCode
                  ? ` (${order.couponCode})`
                  : ''}
              </span>

              <span className="font-medium">
                -{formatCurrency(order.discount)}
              </span>
            </p>

            <p className="flex justify-between gap-4">
              <span className="text-gray-600">
                Shipping
              </span>

              <span className="font-medium">
                {formatCurrency(
                  order.shippingFee,
                )}
              </span>
            </p>

            <p className="flex justify-between gap-4">
              <span className="text-gray-600">
                Tax
              </span>

              <span className="font-medium">
                {formatCurrency(order.tax)}
              </span>
            </p>
          </div>

          <div className="mt-3 border-t border-gray-300 pt-3">
            <p className="flex items-center justify-between gap-4 text-lg font-extrabold">
              <span>Total (COD)</span>

              <span>
                {formatCurrency(order.total)}
              </span>
            </p>
          </div>
        </div>

        {/* Notes */}
        {(order.specialInstructions ||
          order.giftNote) && (
          <div className="invoice-notes mt-5 rounded-lg border border-gray-300 p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-gray-500">
              Customer notes
            </p>

            {order.specialInstructions && (
              <div className="mt-3">
                <p className="text-sm font-semibold">
                  Special instructions
                </p>

                <p className="mt-1 text-sm text-gray-700">
                  {order.specialInstructions}
                </p>
              </div>
            )}

            {order.giftNote && (
              <div className="mt-3">
                <p className="text-sm font-semibold">
                  Gift note
                </p>

                <p className="mt-1 text-sm text-gray-700">
                  {order.giftNote}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Invoice footer */}
        <div className="invoice-footer mt-6 border-t border-gray-300 pt-3 text-center">
          <p className="text-sm font-semibold">
            Thank you for shopping with{' '}
            {order.storeName}.
          </p>

          <p className="mt-1 text-xs text-gray-500">
            This is a computer-generated invoice
            and does not require a signature.
          </p>

          <p className="mt-1 text-xs text-gray-500">
            Powered by Vendora
          </p>
        </div>
      </div>

      {/* =====================================================
          SCREEN CONTENT
      ====================================================== */}

      <div className="print:hidden">
        <PageHeader
          title={`Order ${order.orderNumber}`}
          description={`Placed ${formatDate(
            order.createdAt,
            'MMM D, YYYY h:mm A',
          )}`}
          actions={
            <>
              <LiveBadge className="mr-1" />

              <Button
                asChild
                variant="ghost"
                size="sm"
              >
                <Link to="/merchant/orders">
                  <ArrowLeft />
                  Orders
                </Link>
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={() => window.print()}
              >
                <Printer />
                Print invoice
              </Button>
            </>
          }
        />

        <div className="mb-5 flex flex-wrap items-center gap-3">
          <OrderStatusBadge
            status={order.status}
          />

          {order.cashReceived && (
            <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2.5 py-0.5 text-xs font-medium text-success">
              <Banknote className="size-3.5" />

              Cash received{' '}

              {order.cashReceivedAt
                ? formatDate(
                    order.cashReceivedAt,
                  )
                : ''}
            </span>
          )}

          <div className="ml-auto flex flex-wrap gap-2">
            {nextStatus && (
              <Button
                size="sm"
                loading={mutate.isPending}
                onClick={() =>
                  mutate.mutate(() =>
                    ordersService.advanceStatus(
                      order,
                      actor,
                    ),
                  )
                }
              >
                <Check />

                {ADVANCE_LABELS[order.status]}
              </Button>
            )}

            {order.status === 'delivered' && (
              <Button
                size="sm"
                variant="success"
                onClick={() =>
                  setCashConfirmOpen(true)
                }
              >
                <Banknote />
                Cash received
              </Button>
            )}

            {order.status ===
              'refund_requested' && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setRefundAction('approve')
                  }
                >
                  <Undo2 />
                  Approve return
                </Button>

                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setRefundAction('decline')
                  }
                >
                  <XCircle />
                  Decline refund
                </Button>
              </>
            )}

            {canCancel && (
              <Button
                size="sm"
                variant="destructive"
                onClick={() =>
                  setCancelOpen(true)
                }
              >
                <XCircle />
                Cancel order
              </Button>
            )}
          </div>
        </div>

        {order.status ===
          'refund_requested' &&
          order.returnReason && (
            <div className="mb-5 rounded-xl border border-orange-500/40 bg-orange-500/10 px-4 py-3 text-sm">
              <span className="font-medium">
                Refund requested:
              </span>{' '}
              {order.returnReason}
            </div>
          )}

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle>
                  Items ({order.items.length})
                </CardTitle>
              </CardHeader>

              <CardContent className="space-y-4">
                {order.items.map(
                  (item, i) => (
                    <div
                      key={`${item.productId}-${i}`}
                      className="flex items-center gap-3"
                    >
                      {item.imageUrl ? (
                        <img
                          src={item.imageUrl}
                          alt={item.name}
                          className="size-14 shrink-0 rounded-lg border object-cover"
                        />
                      ) : (
                        <span className="flex size-14 shrink-0 items-center justify-center rounded-lg bg-muted">
                          <Package className="size-5 text-muted-foreground" />
                        </span>
                      )}

                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">
                          {item.name}
                        </p>

                        <p className="text-xs text-muted-foreground">
                          {item.variant &&
                            Object.entries(
                              item.variant,
                            )
                              .map(
                                ([key, value]) =>
                                  `${key}: ${value}`,
                              )
                              .join(' · ')}

                          {item.sku
                            ? `${
                                item.variant
                                  ? ' · '
                                  : ''
                              }SKU ${item.sku}`
                            : ''}
                        </p>

                        <p className="text-sm text-muted-foreground">
                          {formatCurrency(
                            item.price,
                          )}{' '}
                          × {item.quantity}
                        </p>
                      </div>

                      <p className="whitespace-nowrap font-semibold">
                        {formatCurrency(
                          item.price *
                            item.quantity,
                        )}
                      </p>
                    </div>
                  ),
                )}

                <Separator />

                <div className="ml-auto w-full max-w-xs space-y-1.5 text-sm">
                  <p className="flex justify-between text-muted-foreground">
                    <span>Subtotal</span>

                    <span>
                      {formatCurrency(
                        order.subtotal,
                      )}
                    </span>
                  </p>

                  <p className="flex justify-between text-muted-foreground">
                    <span>
                      Discount
                      {order.couponCode
                        ? ` (${order.couponCode})`
                        : ''}
                    </span>

                    <span>
                      -
                      {formatCurrency(
                        order.discount,
                      )}
                    </span>
                  </p>

                  <p className="flex justify-between text-muted-foreground">
                    <span>Shipping</span>

                    <span>
                      {formatCurrency(
                        order.shippingFee,
                      )}
                    </span>
                  </p>

                  <p className="flex justify-between text-muted-foreground">
                    <span>Tax</span>

                    <span>
                      {formatCurrency(order.tax)}
                    </span>
                  </p>

                  <Separator />

                  <p className="flex justify-between text-base font-bold">
                    <span>Total (COD)</span>

                    <span>
                      {formatCurrency(
                        order.total,
                      )}
                    </span>
                  </p>
                </div>
              </CardContent>
            </Card>

            {(order.specialInstructions ||
              order.giftNote) && (
              <Card>
                <CardHeader>
                  <CardTitle>
                    Notes from customer
                  </CardTitle>
                </CardHeader>

                <CardContent className="space-y-3 text-sm">
                  {order.specialInstructions && (
                    <div className="flex gap-2">
                      <MessageSquare className="mt-0.5 size-4 shrink-0 text-muted-foreground" />

                      <div>
                        <p className="font-medium">
                          Special instructions
                        </p>

                        <p className="text-muted-foreground">
                          {
                            order.specialInstructions
                          }
                        </p>
                      </div>
                    </div>
                  )}

                  {order.giftNote && (
                    <div className="flex gap-2">
                      <Gift className="mt-0.5 size-4 shrink-0 text-muted-foreground" />

                      <div>
                        <p className="font-medium">
                          Gift note
                        </p>

                        <p className="text-muted-foreground">
                          {order.giftNote}
                        </p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>
                  Customer
                </CardTitle>
              </CardHeader>

              <CardContent className="space-y-1 text-sm">
                <p className="font-medium">
                  {order.customerName}
                </p>

                <p className="text-muted-foreground">
                  {order.customerEmail}
                </p>

                <p className="text-muted-foreground">
                  {order.customerPhone}
                </p>

                <Separator className="my-3" />

                <p className="font-medium">
                  Shipping address
                </p>

                <p className="text-muted-foreground">
                  {
                    order.shippingAddress
                      .fullName
                  }

                  <br />

                  {
                    order.shippingAddress
                      .line1
                  }

                  {order.shippingAddress
                    .line2 && (
                    <>
                      <br />

                      {
                        order.shippingAddress
                          .line2
                      }
                    </>
                  )}

                  <br />

                  {
                    order.shippingAddress
                      .city
                  }
                  ,{' '}
                  {
                    order.shippingAddress
                      .province
                  }{' '}
                  {
                    order.shippingAddress
                      .postalCode
                  }

                  <br />

                  {
                    order.shippingAddress
                      .country
                  }
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>
                  Timeline
                </CardTitle>
              </CardHeader>

              <CardContent>
                <Timeline order={order} />
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* =====================================================
          DIALOGS
      ====================================================== */}

      <ConfirmDialog
        open={cashConfirmOpen}
        onOpenChange={setCashConfirmOpen}
        title="Confirm cash received?"
        description="Confirming that you collected the cash payment will automatically mark this order as completed. This cannot be undone."
        confirmLabel="Yes, cash received"
        onConfirm={async () => {
          await ordersService.markCashReceived(
            order,
            actor,
          )

          toast.success(
            'Payment confirmed — order completed',
          )

          await refresh()
        }}
      />

      <ConfirmDialog
        open={refundAction === 'approve'}
        onOpenChange={(open) =>
          !open &&
          setRefundAction(null)
        }
        title="Approve return?"
        description="The order will be marked as returned. Arrange the pickup/refund with the customer directly."
        confirmLabel="Approve return"
        onConfirm={async () => {
          await ordersService.setStatus(
            order,
            'returned',
            actor,
            'Return approved by merchant',
          )

          toast.success('Return approved')
          setRefundAction(null)

          await refresh()
        }}
      />

      <ConfirmDialog
        open={refundAction === 'decline'}
        onOpenChange={(open) =>
          !open &&
          setRefundAction(null)
        }
        title="Decline refund request?"
        description="The order will go back to completed. Consider messaging the customer to explain the decision."
        confirmLabel="Decline refund"
        destructive
        onConfirm={async () => {
          await ordersService.setStatus(
            order,
            'completed',
            actor,
            'Refund request declined by merchant',
          )

          toast.success(
            'Refund request declined',
          )

          setRefundAction(null)

          await refresh()
        }}
      />

      <Dialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              Cancel order{' '}
              {order.orderNumber}?
            </DialogTitle>

            <DialogDescription>
              Stock will be restored and the
              customer notified. Please provide
              a reason.
            </DialogDescription>
          </DialogHeader>

          <Textarea
            rows={3}
            placeholder="e.g. Item damaged in storage, cannot fulfil…"
            value={cancelReason}
            onChange={(e) =>
              setCancelReason(
                e.target.value,
              )
            }
          />

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() =>
                setCancelOpen(false)
              }
            >
              Keep order
            </Button>

            <Button
              variant="destructive"
              disabled={!cancelReason.trim()}
              loading={mutate.isPending}
              onClick={() =>
                mutate.mutate(
                  async () => {
                    await ordersService.cancel(
                      order,
                      actor,
                      cancelReason.trim(),
                    )

                    setCancelOpen(false)
                    setCancelReason('')
                  },
                )
              }
            >
              Cancel order
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}