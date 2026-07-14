import * as React from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Heart, ShoppingCart, Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { ProductCardSkeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/misc'
import { SEO } from '@/components/shared/seo'
import {
  PriceDisplay,
  effectivePrice,
} from '@/components/shared/price'
import { productsService } from '@/services/products.service'
import { useWishlistStore } from '@/stores/wishlist-store'
import { useCartStore } from '@/stores/cart-store'

export default function WishlistPage() {
  const ids = useWishlistStore((state) => state.productIds)
  const removeFromWishlist = useWishlistStore((state) => state.remove)
  const addItem = useCartStore((state) => state.addItem)

  /*
   * Return the document to the left edge when this page opens.
   * This also fixes a previously retained horizontal scroll position.
   */
  React.useEffect(() => {
    window.scrollTo({
      top: window.scrollY,
      left: 0,
      behavior: 'auto',
    })

    document.documentElement.scrollLeft = 0
    document.body.scrollLeft = 0
  }, [])

  const {
    data,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['products', 'wishlist', ids],
    queryFn: () => productsService.getManyByIds(ids),
    enabled: ids.length > 0,
  })

  const products = React.useMemo(
    () =>
      ids
        .map((id) => data?.find((product) => product.id === id))
        .filter(
          (product): product is NonNullable<typeof product> =>
            Boolean(product),
        ),
    [data, ids],
  )

  return (
    <div className="w-full min-w-0 max-w-full overflow-x-hidden">
      <SEO title="My wishlist" />

      <div className="mb-5 min-w-0">
        <h2 className="break-words text-lg font-bold tracking-tight">
          My wishlist ({ids.length})
        </h2>
      </div>

      {ids.length === 0 ? (
        <div className="flex min-h-[360px] w-full min-w-0 items-center justify-center overflow-hidden py-8 sm:min-h-[440px]">
          <EmptyState
            icon={Heart}
            title="Your wishlist is empty"
            description="Tap the heart on any product to save it here for later."
            className="w-full min-w-0 max-w-md px-3"
            action={
              <Button
                asChild
                className="w-full max-w-[220px] sm:w-auto"
              >
                <Link to="/shop">
                  Discover products
                </Link>
              </Button>
            }
          />
        </div>
      ) : isLoading ? (
        <div className="grid min-w-0 grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="min-w-0">
              <ProductCardSkeleton />
            </div>
          ))}
        </div>
      ) : isError ? (
        <div className="flex min-h-[360px] w-full min-w-0 items-center justify-center overflow-hidden py-8">
          <EmptyState
            icon={Heart}
            title="Couldn't load your wishlist"
            className="w-full min-w-0 max-w-md px-3"
            action={
              <Button
                type="button"
                className="w-full max-w-[180px] sm:w-auto"
                onClick={() => void refetch()}
              >
                Try again
              </Button>
            }
          />
        </div>
      ) : products.length === 0 ? (
        <div className="flex min-h-[360px] w-full min-w-0 items-center justify-center overflow-hidden py-8">
          <EmptyState
            icon={Heart}
            title="Wishlist products unavailable"
            description="Some saved products may have been removed."
            className="w-full min-w-0 max-w-md px-3"
            action={
              <Button
                asChild
                className="w-full max-w-[220px] sm:w-auto"
              >
                <Link to="/shop">
                  Discover products
                </Link>
              </Button>
            }
          />
        </div>
      ) : (
        <div className="grid min-w-0 grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
          {products.map((product) => {
            const outOfStock = product.stock <= 0
            const productImage = product.images[0]
            const productPrice = effectivePrice(product).price

            return (
              <article
                key={product.id}
                className="
                  flex
                  min-w-0
                  flex-col
                  overflow-hidden
                  rounded-xl
                  border
                  bg-card
                  shadow-sm
                "
              >
                <Link
                  to={`/products/${product.slug}`}
                  className="block aspect-square min-w-0 overflow-hidden bg-muted"
                >
                  {productImage ? (
                    <img
                      src={productImage}
                      alt={product.name}
                      loading="lazy"
                      className="
                        size-full
                        max-w-full
                        object-cover
                        transition-transform
                        duration-300
                        hover:scale-105
                      "
                    />
                  ) : (
                    <div className="flex size-full items-center justify-center text-muted-foreground">
                      <ShoppingCart className="size-8 opacity-30" />
                    </div>
                  )}
                </Link>

                <div className="flex min-w-0 flex-1 flex-col gap-2 p-2.5 sm:p-3">
                  <Link
                    to={`/products/${product.slug}`}
                    title={product.name}
                    className="
                      line-clamp-2
                      min-w-0
                      break-words
                      text-xs
                      font-medium
                      leading-snug
                      hover:text-primary

                      sm:text-sm
                    "
                  >
                    {product.name}
                  </Link>

                  <div className="min-w-0">
                    <PriceDisplay
                      product={product}
                      size="sm"
                    />
                  </div>

                  <div className="mt-auto grid min-w-0 grid-cols-[minmax(0,1fr)_2rem] gap-1.5">
                    <Button
                      type="button"
                      size="sm"
                      className="min-w-0 px-2"
                      disabled={outOfStock}
                      onClick={() => {
                        addItem({
                          productId: product.id,
                          storeId: product.storeId,
                          storeName: '',
                          name: product.name,
                          imageUrl: productImage,
                          price: productPrice,
                          quantity: product.minOrderQty ?? 1,
                          stock: product.stock,
                          maxOrderQty: product.maxOrderQty,
                        })

                        removeFromWishlist(product.id)
                        toast.success('Moved to cart')
                      }}
                    >
                      <ShoppingCart className="size-4 shrink-0" />

                      <span className="truncate">
                        {outOfStock
                          ? 'Out of stock'
                          : 'Move to cart'}
                      </span>
                    </Button>

                    <Button
                      type="button"
                      variant="outline"
                      size="icon-sm"
                      className="size-8 shrink-0"
                      aria-label={`Remove ${product.name} from wishlist`}
                      onClick={() => {
                        removeFromWishlist(product.id)
                        toast.success('Removed from wishlist')
                      }}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </div>
  )
}