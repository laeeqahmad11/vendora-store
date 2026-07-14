import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { ProductCard } from '@/components/shared/product-card'
import { ProductCardSkeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import type { Product } from '@/types'

interface ProductShelfProps {
  title: string
  subtitle?: string
  products: Product[] | undefined
  loading: boolean
  viewAllTo?: string
  /** Extra content rendered next to the heading (e.g. a countdown) */
  accessory?: ReactNode
  max?: number
  className?: string
}

/**
 * Homepage / detail-page product shelf. Hides itself entirely when the data
 * has loaded and there is nothing to show.
 */
export function ProductShelf({
  title,
  subtitle,
  products,
  loading,
  viewAllTo,
  accessory,
  max = 8,
  className,
}: ProductShelfProps) {
  if (!loading && !products?.length) return null

  return (
    <section className={cn('mx-auto w-full max-w-7xl px-4 sm:px-6', className)}>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-center gap-4">
          <div>
            <h2 className="text-xl font-bold tracking-tight sm:text-2xl">{title}</h2>
            {subtitle && <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>}
          </div>
          {accessory}
        </div>
        {viewAllTo && (
          <Link
            to={viewAllTo}
            className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
          >
            View all <ArrowRight className="size-3.5" />
          </Link>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
        {loading
          ? Array.from({ length: 4 }).map((_, i) => <ProductCardSkeleton key={i} />)
          : products!.slice(0, max).map((p) => <ProductCard key={p.id} product={p} />)}
      </div>
    </section>
  )
}
