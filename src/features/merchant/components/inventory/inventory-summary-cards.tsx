import { AlertTriangle, Boxes, Package, XCircle } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { formatNumber } from '@/lib/utils'
import type { StockTab } from './inventory.types'

interface InventorySummaryCardsProps {
  totalProducts: number
  totalStock: number
  lowStockCount: number
  outOfStockCount: number
  activeTab: StockTab
  onTabChange: (tab: StockTab) => void
}

export function InventorySummaryCards({
  totalProducts,
  totalStock,
  lowStockCount,
  outOfStockCount,
  activeTab,
  onTabChange,
}: InventorySummaryCardsProps) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
      <button
        type="button"
        onClick={() => onTabChange('all')}
        className="min-w-0 rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
      >
        <Card
          className={
            activeTab === 'all'
              ? 'h-full border-primary/40 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md'
              : 'h-full transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md'
          }
        >
          <CardContent className="flex h-full min-h-[112px] items-center justify-between gap-2 p-3 sm:min-h-[124px] sm:gap-4 sm:p-5">
            <div className="min-w-0">
              <p className="truncate text-xs text-muted-foreground sm:text-sm">Products</p>

              <p className="mt-1 truncate text-xl font-bold sm:text-2xl">{formatNumber(totalProducts)}</p>
            </div>

            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary sm:size-11 sm:rounded-xl">
              <Package className="size-4 sm:size-5" />
            </div>
          </CardContent>
        </Card>
      </button>

      <Card className="h-full">
        <CardContent className="flex h-full min-h-[112px] items-center justify-between gap-2 p-3 sm:min-h-[124px] sm:gap-4 sm:p-5">
          <div className="min-w-0">
            <p className="truncate text-xs text-muted-foreground sm:text-sm">Available units</p>

            <p className="mt-1 truncate text-xl font-bold sm:text-2xl">{formatNumber(totalStock)}</p>
          </div>

          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary sm:size-11 sm:rounded-xl">
            <Boxes className="size-4 sm:size-5" />
          </div>
        </CardContent>
      </Card>

      <button
        type="button"
        onClick={() => onTabChange('low')}
        className="min-w-0 rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-warning focus-visible:ring-offset-2"
      >
        <Card
          className={
            activeTab === 'low'
              ? 'h-full border-warning/50 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md'
              : 'h-full transition hover:-translate-y-0.5 hover:border-warning/40 hover:shadow-md'
          }
        >
          <CardContent className="flex h-full min-h-[112px] items-center justify-between gap-2 p-3 sm:min-h-[124px] sm:gap-4 sm:p-5">
            <div className="min-w-0">
              <p className="truncate text-xs text-muted-foreground sm:text-sm">Low stock</p>

              <p className="mt-1 truncate text-xl font-bold text-warning sm:text-2xl">
                {formatNumber(lowStockCount)}
              </p>
            </div>

            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-warning/10 text-warning sm:size-11 sm:rounded-xl">
              <AlertTriangle className="size-4 sm:size-5" />
            </div>
          </CardContent>
        </Card>
      </button>

      <button
        type="button"
        onClick={() => onTabChange('out')}
        className="min-w-0 rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive focus-visible:ring-offset-2"
      >
        <Card
          className={
            activeTab === 'out'
              ? 'h-full border-destructive/50 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md'
              : 'h-full transition hover:-translate-y-0.5 hover:border-destructive/40 hover:shadow-md'
          }
        >
          <CardContent className="flex h-full min-h-[112px] items-center justify-between gap-2 p-3 sm:min-h-[124px] sm:gap-4 sm:p-5">
            <div className="min-w-0">
              <p className="truncate text-xs text-muted-foreground sm:text-sm">Out of stock</p>

              <p className="mt-1 truncate text-xl font-bold text-destructive sm:text-2xl">
                {formatNumber(outOfStockCount)}
              </p>
            </div>

            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-destructive/10 text-destructive sm:size-11 sm:rounded-xl">
              <XCircle className="size-4 sm:size-5" />
            </div>
          </CardContent>
        </Card>
      </button>
    </div>
  )
}
