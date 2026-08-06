import { Search, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PRODUCT_TAB_OPTIONS } from '../products.constants'
import type { ProductCounts, ProductTab } from '../products.types'

interface ProductsToolbarProps {
  tab: ProductTab
  search: string
  counts: ProductCounts
  onTabChange: (tab: ProductTab) => void
  onSearchChange: (search: string) => void
  onLowStockOnlyChange: (lowStockOnly: boolean) => void
}

export function ProductsToolbar({
  tab,
  search,
  counts,
  onTabChange,
  onSearchChange,
  onLowStockOnlyChange,
}: ProductsToolbarProps) {
  return (
    <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div className="-mx-1 min-w-0 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <Tabs
          value={tab}
          onValueChange={(value) => {
            onTabChange(value as ProductTab)
            onLowStockOnlyChange(false)
          }}
          className="w-max min-w-full"
        >
          <TabsList className="inline-flex h-auto min-w-max gap-1">
            {PRODUCT_TAB_OPTIONS.map((option) => (
              <TabsTrigger
                key={option.value}
                value={option.value}
                className="whitespace-nowrap px-3 text-xs sm:px-4 sm:text-sm"
              >
                <span>{option.label}</span>
                <span className="ml-1 rounded-full bg-background/80 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                  {counts[option.value]}
                </span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      <div className="relative w-full shrink-0 lg:w-72">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />

        <Input
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search by name or SKU…"
          className="h-10 w-full pl-9 pr-9"
        />

        {search && (
          <button
            type="button"
            onClick={() => onSearchChange('')}
            className="absolute right-2.5 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Clear product search"
          >
            <X className="size-4" />
          </button>
        )}
      </div>
    </div>
  )
}
