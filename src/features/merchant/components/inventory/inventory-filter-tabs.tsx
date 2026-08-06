import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { StockTab } from './inventory.types'

interface InventoryFilterTabsProps {
  value: StockTab
  totalCount: number
  lowStockCount: number
  outOfStockCount: number
  onValueChange: (value: StockTab) => void
}

export function InventoryFilterTabs({
  value,
  totalCount,
  lowStockCount,
  outOfStockCount,
  onValueChange,
}: InventoryFilterTabsProps) {
  return (
    <div className="-mx-1 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <Tabs
        value={value}
        onValueChange={(nextValue) => onValueChange(nextValue as StockTab)}
        className="w-max min-w-full"
      >
        <TabsList className="inline-flex h-auto min-w-max gap-1">
          <TabsTrigger value="all" className="whitespace-nowrap px-3 text-xs sm:px-4 sm:text-sm">
            All ({totalCount})
          </TabsTrigger>

          <TabsTrigger value="low" className="whitespace-nowrap px-3 text-xs sm:px-4 sm:text-sm">
            Low stock ({lowStockCount})
          </TabsTrigger>

          <TabsTrigger value="out" className="whitespace-nowrap px-3 text-xs sm:px-4 sm:text-sm">
            Out of stock ({outOfStockCount})
          </TabsTrigger>
        </TabsList>
      </Tabs>
    </div>
  )
}
