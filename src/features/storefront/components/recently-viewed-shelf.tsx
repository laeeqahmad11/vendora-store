import { useQuery } from '@tanstack/react-query'
import { productsService } from '@/services/products.service'
import { useRecentlyViewedStore } from '@/stores/recently-viewed-store'
import { ProductShelf } from './product-shelf'

/** Shelf of the visitor's recently viewed products (from local storage) */
export function RecentlyViewedShelf({ excludeId, className }: { excludeId?: string; className?: string }) {
  const ids = useRecentlyViewedStore((s) => s.productIds)
  const visibleIds = ids.filter((id) => id !== excludeId)

  const { data, isLoading } = useQuery({
    queryKey: ['products', 'recently-viewed', visibleIds],
    queryFn: () => productsService.getManyByIds(visibleIds),
    enabled: visibleIds.length > 0,
  })

  if (!visibleIds.length) return null

  // Preserve the "most recently viewed first" ordering
  const ordered = visibleIds
    .map((id) => data?.find((p) => p.id === id))
    .filter((p): p is NonNullable<typeof p> => Boolean(p))

  return (
    <ProductShelf
      title="Recently viewed"
      subtitle="Pick up where you left off"
      products={ordered}
      loading={isLoading}
      className={className}
    />
  )
}
