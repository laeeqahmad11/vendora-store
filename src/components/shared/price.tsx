import { cn, formatCurrency } from '@/lib/utils'
import type { Product } from '@/types'

/** Resolves the effective sale price for a product (flash sale > compare-at) */
export function effectivePrice(product: Product): { price: number; original?: number } {
  if (product.flashSale?.active && product.flashSale.endsAt > Date.now()) {
    return { price: product.flashSale.salePrice, original: product.price }
  }
  if (product.compareAtPrice && product.compareAtPrice > product.price) {
    return { price: product.price, original: product.compareAtPrice }
  }
  return { price: product.price }
}

export function PriceDisplay({
  product,
  size = 'md',
  className,
}: {
  product: Product
  size?: 'sm' | 'md' | 'lg'
  className?: string
}) {
  const { price, original } = effectivePrice(product)
  const sizeCls = { sm: 'text-sm', md: 'text-base', lg: 'text-2xl' }[size]
  return (
    <div className={cn('flex items-baseline gap-2', className)}>
      <span className={cn('font-bold tracking-tight', sizeCls)}>{formatCurrency(price, product.currency)}</span>
      {original && (
        <span className="text-sm text-muted-foreground line-through">
          {formatCurrency(original, product.currency)}
        </span>
      )}
    </div>
  )
}
