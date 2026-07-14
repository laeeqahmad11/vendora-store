import { Link, useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { orderBy, where } from 'firebase/firestore'
import toast from 'react-hot-toast'
import {
  ArrowRight,
  Package,
  RotateCcw,
  ShoppingCart,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { TableSkeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/misc'
import { SEO } from '@/components/shared/seo'
import { ordersService } from '@/services/orders.service'
import { useAuthStore } from '@/stores/auth-store'
import { useCartStore } from '@/stores/cart-store'
import { useRealtimeCollection } from '@/hooks/use-realtime'
import { LiveBadge } from '@/components/shared/live-badge'
import {
  COLLECTIONS,
  ORDER_STATUS_COLORS,
  ORDER_STATUS_LABELS,
} from '@/lib/constants'
import {
  formatCurrency,
  formatDate,
  getErrorMessage,
} from '@/lib/utils'
import type { Order } from '@/types'

function OrderCard({ order }: { order: Order }) {
  const navigate = useNavigate()
  const addItem = useCartStore((state) => state.addItem)

  const reorder = useMutation({
    mutationFn: () => ordersService.reorderProducts(order),

    onSuccess: (products) => {
      let added = 0

      for (const item of order.items) {
        const product = products.find(
          (productItem) =>
            productItem.id === item.productId,
        )

        if (!product || product.stock <= 0) {
          continue
        }

        addItem({
          productId: product.id,
          storeId: product.storeId,
          storeName: order.storeName,
          name: product.name,
          imageUrl:
            product.images[0] ?? item.imageUrl,
          price: product.price,
          quantity: Math.min(
            item.quantity,
            product.stock,
          ),
          stock: product.stock,
          maxOrderQty: product.maxOrderQty,
          variantId: item.variantId,
          variant: item.variant,
        })

        added++
      }

      if (added) {
        toast.success(
          `${added} item${
            added > 1 ? 's' : ''
          } added back to your cart`,
        )

        navigate('/cart')
      } else {
        toast.error(
          'These items are no longer available.',
        )
      }
    },

    onError: (error) =>
      toast.error(getErrorMessage(error)),
  })

  const itemCount = order.items.reduce(
    (sum, item) => sum + item.quantity,
    0,
  )

  return (
    <Card className="min-w-0 overflow-hidden p-4 sm:p-5">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">
            {order.orderNumber}
          </p>

          <p className="mt-1 break-words text-xs leading-5 text-muted-foreground">
            {formatDate(order.createdAt)}
            <span aria-hidden="true"> · </span>
            {order.storeName}
          </p>
        </div>

        <Badge
          className={`shrink-0 ${ORDER_STATUS_COLORS[order.status]}`}
        >
          {ORDER_STATUS_LABELS[order.status]}
        </Badge>
      </div>

      <div className="-mx-1 mt-4 overflow-x-auto px-1 pb-1">
        <div className="flex min-w-max items-center gap-2">
          {order.items
            .slice(0, 5)
            .map((item, index) => (
              <div
                key={`${item.productId}-${index}`}
                className="size-14 shrink-0 overflow-hidden rounded-lg border bg-muted sm:size-16"
              >
                {item.imageUrl ? (
                  <img
                    src={item.imageUrl}
                    alt={item.name}
                    loading="lazy"
                    className="size-full object-cover"
                  />
                ) : (
                  <div className="flex size-full items-center justify-center text-muted-foreground">
                    <Package className="size-5 opacity-40" />
                  </div>
                )}
              </div>
            ))}

          {order.items.length > 5 && (
            <span className="shrink-0 px-1 text-xs text-muted-foreground">
              +{order.items.length - 5} more
            </span>
          )}
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm">
          <span className="text-muted-foreground">
            {itemCount} item
            {itemCount === 1 ? '' : 's'}
            <span aria-hidden="true"> · </span>
          </span>

          <span className="font-semibold">
            {formatCurrency(order.total)}
          </span>
        </p>

        <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full sm:w-auto"
            loading={reorder.isPending}
            onClick={() => reorder.mutate()}
          >
            <RotateCcw className="size-4" />
            Reorder
          </Button>

          <Button
            size="sm"
            className="w-full sm:w-auto"
            asChild
          >
            <Link
              to={`/account/orders/${order.id}`}
            >
              View details
              <ArrowRight className="size-4" />
            </Link>
          </Button>
        </div>
      </div>
    </Card>
  )
}

export default function OrdersListPage() {
  const { firebaseUser } = useAuthStore()

  // Live subscription — status changes from the merchant appear instantly
  const {
    data,
    isLoading,
    isError,
  } = useRealtimeCollection<Order>(
    COLLECTIONS.orders,
    [
      where(
        'customerId',
        '==',
        firebaseUser?.uid ?? '',
      ),
      orderBy('createdAt', 'desc'),
    ],
    [firebaseUser?.uid],
    !!firebaseUser,
  )

  return (
    <div className="min-w-0">
      <SEO title="My orders" />

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <h2 className="text-xl font-bold tracking-tight sm:text-2xl">
          My orders
        </h2>

        <LiveBadge />
      </div>

      {isLoading ? (
        <TableSkeleton rows={4} />
      ) : isError ? (
        <EmptyState
          icon={Package}
          title="Couldn't load orders"
          description="Something went wrong while loading your order history."
          action={
            <Button
              onClick={() =>
                window.location.reload()
              }
            >
              Try again
            </Button>
          }
        />
      ) : !data?.length ? (
        <EmptyState
          icon={ShoppingCart}
          title="No orders yet"
          description="When you place an order, it will show up here with live tracking."
          action={
            <Button asChild>
              <Link to="/shop">
                Start shopping
                <ArrowRight />
              </Link>
            </Button>
          }
        />
      ) : (
        <div className="min-w-0 space-y-4">
          {data.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
            />
          ))}
        </div>
      )}
    </div>
  )
}