import { ShoppingCart } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/misc'
import type { OrdersTab } from './orders.types'

interface OrdersEmptyStateProps {
  search: string
  tab: OrdersTab
  onClearFilters: () => void
}

export function OrdersEmptyState({
  search,
  tab,
  onClearFilters,
}: OrdersEmptyStateProps) {
  return (
    <EmptyState
      icon={ShoppingCart}
      title={
        search || tab !== 'all'
          ? 'No matching orders'
          : 'No orders yet'
      }
      description={
        search || tab !== 'all'
          ? 'Try a different filter or search term.'
          : 'Orders appear here as soon as customers buy from your store.'
      }
      action={
        search || tab !== 'all' ? (
          <Button
            variant="outline"
            onClick={onClearFilters}
          >
            Clear filters
          </Button>
        ) : undefined
      }
    />
  )
}
