import type { Product, ProductStatus } from '@/types'
import type { ProductCounts, ProductTab } from './products.types'

export function isLowStock(product: Product) {
  return product.stock > 0 && product.stock <= (product.lowStockThreshold ?? 5)
}

export function getProductCounts(products: Product[]): ProductCounts {
  const statusCounts = products.reduce(
    (result, product) => {
      result[product.status] = (result[product.status] ?? 0) + 1
      return result
    },
    {} as Partial<Record<ProductStatus, number>>,
  )

  return {
    all: products.length,
    draft: statusCounts.draft ?? 0,
    pending: statusCounts.pending ?? 0,
    approved: statusCounts.approved ?? 0,
    rejected: statusCounts.rejected ?? 0,
    archived: statusCounts.archived ?? 0,
    lowStock: products.filter(isLowStock).length,
  }
}

export function filterProducts(products: Product[], tab: ProductTab, search: string, lowStockOnly: boolean) {
  let items = tab === 'all' ? products : products.filter((product) => product.status === tab)

  if (lowStockOnly) {
    items = items.filter(isLowStock)
  }

  const query = search.trim().toLowerCase()

  if (query) {
    items = items.filter(
      (product) => product.name.toLowerCase().includes(query) || product.sku?.toLowerCase().includes(query),
    )
  }

  return items
}
