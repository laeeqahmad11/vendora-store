import * as React from 'react'
import type { Product } from '@/types'
import { filterProducts, getProductCounts } from '../products.utils'
import type { ProductTab } from '../products.types'

export function useProductsListState(products: Product[]) {
  const [tab, setTab] = React.useState<ProductTab>('all')
  const [search, setSearch] = React.useState('')
  const [lowStockOnly, setLowStockOnly] = React.useState(false)

  const counts = React.useMemo(() => getProductCounts(products), [products])

  const visible = React.useMemo(
    () => filterProducts(products, tab, search, lowStockOnly),
    [products, tab, search, lowStockOnly],
  )

  const clearFilters = () => {
    setTab('all')
    setSearch('')
    setLowStockOnly(false)
  }

  return {
    tab,
    setTab,
    search,
    setSearch,
    lowStockOnly,
    setLowStockOnly,
    counts,
    visible,
    clearFilters,
  }
}
