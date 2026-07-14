import * as React from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import {
  ArrowRight,
  Bookmark,
  Heart,
  Minus,
  Plus,
  ShoppingCart,
  Tag,
  Trash2,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input, Textarea } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { EmptyState, Separator } from '@/components/ui/misc'
import { SEO } from '@/components/shared/seo'
import { discountsService } from '@/services/discounts.service'
import {
  useCartStore,
  selectItems,
  getActiveItems,
  getSavedItems,
  getSubtotal,
} from '@/stores/cart-store'
import { useWishlistStore } from '@/stores/wishlist-store'
import { formatCurrency, getErrorMessage } from '@/lib/utils'
import type { CartItem } from '@/types'

function CartRow({
  item,
  saved,
}: {
  item: CartItem
  saved?: boolean
}) {
  const {
    updateQuantity,
    removeItem,
    toggleSaveForLater,
  } = useCartStore()

  const wishlistToggle = useWishlistStore(
    (state) => state.toggle,
  )

  const inWishlist = useWishlistStore(
    (state) =>
      state.productIds.includes(item.productId),
  )

  const maxQty = Math.min(
    item.stock,
    item.maxOrderQty ?? Infinity,
  )

  return (
    <div className="flex min-w-0 gap-3 py-4 sm:gap-4">
      <div className="size-16 shrink-0 overflow-hidden rounded-lg border bg-muted sm:size-20 md:size-24">
        {item.imageUrl ? (
          <img
            src={item.imageUrl}
            alt={item.name}
            className="size-full object-cover"
          />
        ) : (
          <div className="flex size-full items-center justify-center text-muted-foreground">
            <ShoppingCart className="size-6 opacity-30" />
          </div>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex min-w-0 items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="line-clamp-2 text-sm font-medium leading-5">
              {item.name}
            </p>

            {item.variant && (
              <p className="mt-0.5 break-words text-xs text-muted-foreground">
                {Object.entries(item.variant)
                  .map(([key, value]) => `${key}: ${value}`)
                  .join(' · ')}
              </p>
            )}

            {item.storeName && (
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                Sold by {item.storeName}
              </p>
            )}
          </div>

          <p className="shrink-0 whitespace-nowrap text-sm font-semibold">
            {formatCurrency(item.price * item.quantity)}
          </p>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-1.5 sm:gap-2">
          {!saved && (
            <div className="flex shrink-0 items-center rounded-lg border bg-background">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Decrease quantity"
                disabled={item.quantity <= 1}
                onClick={() =>
                  updateQuantity(
                    item.productId,
                    item.variantId,
                    item.quantity - 1,
                  )
                }
              >
                <Minus />
              </Button>

              <span className="w-9 text-center text-sm font-medium tabular-nums">
                {item.quantity}
              </span>

              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Increase quantity"
                disabled={item.quantity >= maxQty}
                onClick={() =>
                  updateQuantity(
                    item.productId,
                    item.variantId,
                    item.quantity + 1,
                  )
                }
              >
                <Plus />
              </Button>
            </div>
          )}

          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-9 px-2.5 text-xs sm:px-3 sm:text-sm"
            onClick={() =>
              toggleSaveForLater(
                item.productId,
                item.variantId,
              )
            }
          >
            <Bookmark className="size-4" />
            {saved ? 'Move to cart' : 'Save for later'}
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-9 px-2.5 text-xs sm:px-3 sm:text-sm"
            onClick={() => {
              if (!inWishlist) {
                wishlistToggle(item.productId)
              }

              removeItem(
                item.productId,
                item.variantId,
              )

              toast.success('Moved to wishlist')
            }}
          >
            <Heart className="size-4" />
            Wishlist
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Remove ${item.name} from cart`}
            className="h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive"
            onClick={() => {
              removeItem(
                item.productId,
                item.variantId,
              )

              toast.success('Removed from cart')
            }}
          >
            <Trash2 />
          </Button>
        </div>
      </div>
    </div>
  )
}

export default function CartPage() {
  const navigate = useNavigate()

  const items = useCartStore(selectItems)

  const activeItems = React.useMemo(
    () => getActiveItems(items),
    [items],
  )

  const savedItems = React.useMemo(
    () => getSavedItems(items),
    [items],
  )

  const subtotal = React.useMemo(
    () => getSubtotal(items),
    [items],
  )

  const coupon = useCartStore(
    (state) => state.coupon,
  )

  const setCoupon = useCartStore(
    (state) => state.setCoupon,
  )

  const giftNote = useCartStore(
    (state) => state.giftNote,
  )

  const setGiftNote = useCartStore(
    (state) => state.setGiftNote,
  )

  const [code, setCode] = React.useState('')

  const applyCoupon = useMutation({
    mutationFn: (value: string) => {
      const storeIds = [
        ...new Set(
          activeItems.map((item) => item.storeId),
        ),
      ]

      return discountsService.validateCoupon(
        value,
        activeItems,
        storeIds.length === 1
          ? storeIds[0]
          : undefined,
      )
    },

    onSuccess: (result) => {
      setCoupon(result)
      setCode('')

      toast.success(
        `Coupon applied — you save ${formatCurrency(
          result.discount,
        )}!`,
      )
    },

    onError: (error) =>
      toast.error(getErrorMessage(error)),
  })

  const discount = coupon?.discount ?? 0
  const total = Math.max(
    0,
    subtotal - discount,
  )

  if (
    activeItems.length === 0 &&
    savedItems.length === 0
  ) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
        <SEO title="Cart" />

        <EmptyState
          icon={ShoppingCart}
          title="Your cart is empty"
          description="Looks like you haven't added anything yet. Explore the marketplace to find something you'll love."
          action={
            <Button size="lg" asChild>
              <Link to="/shop">
                Start shopping
                <ArrowRight />
              </Link>
            </Button>
          }
        />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <SEO title="Cart" />

      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
        Your cart
      </h1>

      <div className="mt-6 grid min-w-0 gap-8 lg:grid-cols-3">
        <div className="min-w-0 space-y-8 lg:col-span-2">
          {activeItems.length > 0 ? (
            <Card className="min-w-0 divide-y overflow-hidden px-3 sm:px-5">
              {activeItems.map((item) => (
                <CartRow
                  key={`${item.productId}-${item.variantId ?? ''}`}
                  item={item}
                />
              ))}
            </Card>
          ) : (
            <EmptyState
              icon={ShoppingCart}
              title="No active items"
              description="Everything in your cart is saved for later."
            />
          )}

          {savedItems.length > 0 && (
            <div>
              <h2 className="mb-3 text-lg font-semibold">
                Saved for later ({savedItems.length})
              </h2>

              <Card className="min-w-0 divide-y overflow-hidden px-3 sm:px-5">
                {savedItems.map((item) => (
                  <CartRow
                    key={`${item.productId}-${item.variantId ?? ''}`}
                    item={item}
                    saved
                  />
                ))}
              </Card>
            </div>
          )}

          {activeItems.length > 0 && (
            <div>
              <h2 className="mb-2 text-sm font-semibold">
                Gift note (optional)
              </h2>

              <Textarea
                value={giftNote}
                onChange={(event) =>
                  setGiftNote(event.target.value)
                }
                placeholder="Add a personal message to include with your order…"
                maxLength={300}
                rows={4}
                className="resize-y"
              />
            </div>
          )}
        </div>

        {activeItems.length > 0 && (
          <div className="min-w-0">
            <Card className="sticky top-24 min-w-0 p-4 sm:p-6">
              <h2 className="text-lg font-semibold">
                Order summary
              </h2>

              <div className="mt-4">
                {coupon ? (
                  <div className="flex min-w-0 items-center justify-between gap-3 rounded-lg bg-success/10 px-3 py-2 text-sm">
                    <span className="flex min-w-0 items-center gap-1.5 font-medium text-success">
                      <Tag className="size-3.5 shrink-0" />

                      <span className="truncate">
                        {coupon.coupon.code}
                      </span>
                    </span>

                    <button
                      type="button"
                      onClick={() => setCoupon(null)}
                      aria-label="Remove coupon"
                      className="shrink-0 text-muted-foreground transition-colors hover:text-destructive"
                    >
                      <X className="size-4" />
                    </button>
                  </div>
                ) : (
                  <form
                    className="flex flex-col gap-2 min-[390px]:flex-row"
                    onSubmit={(event) => {
                      event.preventDefault()

                      if (code.trim()) {
                        applyCoupon.mutate(
                          code.trim(),
                        )
                      }
                    }}
                  >
                    <Input
                      value={code}
                      onChange={(event) =>
                        setCode(event.target.value)
                      }
                      placeholder="Promo code"
                      aria-label="Promo code"
                      className="min-w-0 flex-1"
                    />

                    <Button
                      type="submit"
                      variant="outline"
                      className="w-full min-[390px]:w-auto"
                      loading={applyCoupon.isPending}
                    >
                      Apply
                    </Button>
                  </form>
                )}
              </div>

              <Separator className="my-4" />

              <dl className="space-y-3 text-sm">
                <div className="flex items-start justify-between gap-4">
                  <dt className="text-muted-foreground">
                    Subtotal
                  </dt>

                  <dd className="shrink-0 whitespace-nowrap font-medium">
                    {formatCurrency(subtotal)}
                  </dd>
                </div>

                {discount > 0 && (
                  <div className="flex items-start justify-between gap-4 text-success">
                    <dt>Discount</dt>

                    <dd className="shrink-0 whitespace-nowrap font-medium">
                      −{formatCurrency(discount)}
                    </dd>
                  </div>
                )}

                <div className="flex items-start justify-between gap-4">
                  <dt className="shrink-0 text-muted-foreground">
                    Shipping
                  </dt>

                  <dd className="max-w-[60%] text-right text-xs leading-5 text-muted-foreground">
                    Calculated at delivery
                  </dd>
                </div>
              </dl>

              <Separator className="my-4" />

              <div className="flex items-center justify-between gap-4 text-base font-bold">
                <span>Total</span>

                <span className="shrink-0 whitespace-nowrap">
                  {formatCurrency(total)}
                </span>
              </div>

              <Button
                size="lg"
                className="mt-5 h-12 w-full"
                onClick={() =>
                  navigate('/checkout')
                }
              >
                Proceed to checkout
                <ArrowRight />
              </Button>

              <Button
                variant="ghost"
                className="mt-2 w-full"
                asChild
              >
                <Link to="/shop">
                  Continue shopping
                </Link>
              </Button>
            </Card>
          </div>
        )}
      </div>
    </div>
  )
}