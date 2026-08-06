interface ProductsResultCountProps {
  visibleCount: number
  totalCount: number
}

export function ProductsResultCount({ visibleCount, totalCount }: ProductsResultCountProps) {
  if (visibleCount === 0) return null

  return (
    <p className="text-sm text-muted-foreground">
      Showing {visibleCount} of {totalCount} {totalCount === 1 ? 'product' : 'products'}
    </p>
  )
}
