import { Link } from 'react-router-dom'
import { Card } from '@/components/ui/card'
import {
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

interface OrdersMobileListProps {
  orders: Order[]
}

export function OrdersMobileList({
  orders,
}: OrdersMobileListProps) {
  return (
    <div className="space-y-3 md:hidden">
      {orders.map((order) => (
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
                {getCustomerInitial(
                  order.customerName,
                )}
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
                  {getCodPaymentLabel(
                    order.cashReceived,
                  )}
                </p>
              </div>

              <div className="text-right">
                <p className="text-xs text-muted-foreground">
                  Total
                </p>

                <p className="mt-1 font-semibold">
                  {formatCurrency(order.total)}
                </p>
              </div>
            </div>
          </Card>
        </Link>
      ))}
    </div>
  )
}
