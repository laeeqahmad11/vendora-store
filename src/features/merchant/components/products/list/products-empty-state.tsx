import { Link } from 'react-router-dom'
import { Package, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/misc'
import type { ProductTab } from '../products.types'

interface ProductsEmptyStateProps {
  search: string
  tab: ProductTab
  lowStockOnly: boolean
  onClearFilters: () => void
}

export function ProductsEmptyState({ search, tab, lowStockOnly, onClearFilters }: ProductsEmptyStateProps) {
  const hasFilters = Boolean(search || tab !== 'all' || lowStockOnly)

  return (
    <EmptyState
      icon={Package}
      title={hasFilters ? 'No matching products' : 'No products yet'}
      description={
        hasFilters
          ? 'Try a different filter or search term.'
          : 'Create your first product to start selling on Vendora.'
      }
      action={
        hasFilters ? (
          <Button type="button" variant="outline" onClick={onClearFilters}>
            Clear filters
          </Button>
        ) : (
          <Button asChild>
            <Link to="/merchant/products/new">
              <Plus className="size-4" />
              Add product
            </Link>
          </Button>
        )
      }
    />
  )
}
