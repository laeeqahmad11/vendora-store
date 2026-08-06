import { Link } from 'react-router-dom'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  cn,
  formatCurrency,
  formatDate,
} from '@/lib/utils'
import type { Order } from '@/types'
import { OrderStatusBadge } from '../common'
import {
  getCodPaymentLabel,
  getCustomerInitial,
  getItemCount,
} from './orders.utils'

interface OrdersTableProps {
  orders: Order[]
  onOpenOrder: (orderId: string) => void
}

export function OrdersTable({
  orders,
  onOpenOrder,
}: OrdersTableProps) {
  return (
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
            {orders.map((order) => (
              <TableRow
                key={order.id}
                tabIndex={0}
                role="link"
                className="cursor-pointer transition-colors hover:bg-primary/[0.04] focus-visible:bg-primary/[0.05] focus-visible:outline-none"
                onClick={() =>
                  onOpenOrder(order.id)
                }
                onKeyDown={(event) => {
                  if (
                    event.key === 'Enter' ||
                    event.key === ' '
                  ) {
                    event.preventDefault()
                    onOpenOrder(order.id)
                  }
                }}
              >
                <TableCell>
                  <Link
                    to={`/merchant/orders/${order.id}`}
                    className="inline-block max-w-[160px] truncate font-semibold text-primary hover:underline"
                    title={order.orderNumber}
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
                      {getCustomerInitial(
                        order.customerName,
                      )}
                    </span>

                    <div className="min-w-0">
                      <p
                        className="max-w-[160px] truncate font-medium"
                        title={order.customerName}
                      >
                        {order.customerName}
                      </p>

                      <p
                        className="mt-0.5 max-w-[160px] truncate text-xs text-muted-foreground"
                        title={order.customerPhone}
                      >
                        {order.customerPhone}
                      </p>
                    </div>
                  </div>
                </TableCell>

                <TableCell>
                  {getItemCount(order)}
                </TableCell>

                <TableCell className="whitespace-nowrap font-semibold">
                  {formatCurrency(order.total)}
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
                    {getCodPaymentLabel(
                      order.cashReceived,
                    )}
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
  )
}
