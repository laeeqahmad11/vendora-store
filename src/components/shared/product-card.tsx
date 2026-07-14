import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import toast from 'react-hot-toast'
import { Heart, ShoppingCart, Star } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { PriceDisplay, effectivePrice } from '@/components/shared/price'
import { useCartStore } from '@/stores/cart-store'
import { useWishlistStore } from '@/stores/wishlist-store'
import { cn, discountPercent } from '@/lib/utils'
import type { Product } from '@/types'

export function ProductCard({ product, className }: { product: Product; className?: string }) {
  const addItem = useCartStore((s) => s.addItem)
  const inWishlist = useWishlistStore((s) => s.productIds.includes(product.id))
  const toggleWishlist = useWishlistStore((s) => s.toggle)

  const { price, original } = effectivePrice(product)
  const pct = original ? discountPercent(price, original) : 0
  const outOfStock = product.stock <= 0
  const hasVariants = (product.variants?.length ?? 0) > 0

  const handleAddToCart = (e: React.MouseEvent) => {
    e.preventDefault()
    if (outOfStock) return
    addItem({
      productId: product.id,
      storeId: product.storeId,
      storeName: '',
      name: product.name,
      imageUrl: product.images[0],
      price,
      quantity: product.minOrderQty ?? 1,
      stock: product.stock,
      maxOrderQty: product.maxOrderQty,
    })
    toast.success('Added to cart')
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      className={cn('group', className)}
    >
      <Link
        to={`/products/${product.slug}`}
        className="block overflow-hidden rounded-xl border bg-card shadow-sm transition-shadow hover:shadow-lg"
      >
        <div className="relative aspect-square overflow-hidden bg-muted">
          {product.images[0] ? (
            <img
              src={product.images[0]}
              alt={product.name}
              loading="lazy"
              className="size-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
          ) : (
            <div className="flex size-full items-center justify-center text-muted-foreground">
              <ShoppingCart className="size-10 opacity-30" />
            </div>
          )}

          <div className="absolute left-2 top-2 flex flex-col gap-1">
            {pct > 0 && <Badge variant="destructive">-{pct}%</Badge>}
            {product.flashSale?.active && product.flashSale.endsAt > Date.now() && (
              <Badge variant="warning">Flash Sale</Badge>
            )}
            {outOfStock && <Badge variant="secondary">Out of stock</Badge>}
          </div>

          <button
            type="button"
            onClick={(e) => {
              e.preventDefault()
              toggleWishlist(product.id)
              toast.success(inWishlist ? 'Removed from wishlist' : 'Added to wishlist')
            }}
            aria-label="Toggle wishlist"
            className="absolute right-2 top-2 rounded-full bg-background/80 p-2 shadow backdrop-blur transition-transform hover:scale-110"
          >
            <Heart className={cn('size-4', inWishlist ? 'fill-red-500 text-red-500' : 'text-foreground')} />
          </button>

          {!outOfStock && (
            <div className="absolute inset-x-2 bottom-2 translate-y-2 opacity-0 transition-all duration-200 group-hover:translate-y-0 group-hover:opacity-100">
              {hasVariants ? (
                <Button size="sm" className="w-full" asChild>
                  <span>Choose options</span>
                </Button>
              ) : (
                <Button size="sm" className="w-full" onClick={handleAddToCart}>
                  <ShoppingCart /> Add to cart
                </Button>
              )}
            </div>
          )}
        </div>

        <div className="space-y-1 p-3">
          <h3 className="line-clamp-2 text-sm font-medium leading-snug">{product.name}</h3>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Star className="size-3 fill-amber-400 text-amber-400" />
            {product.rating > 0 ? product.rating.toFixed(1) : 'New'}
            {product.ratingCount > 0 && <span>({product.ratingCount})</span>}
            {product.soldCount > 0 && <span className="ml-1">· {product.soldCount} sold</span>}
          </div>
          <PriceDisplay product={product} size="sm" />
        </div>
      </Link>
    </motion.div>
  )
}
