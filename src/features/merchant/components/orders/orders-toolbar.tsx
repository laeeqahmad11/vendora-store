import { Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs'
import { ORDER_TABS } from './orders.constants'
import type { OrdersTab } from './orders.types'

interface OrdersToolbarProps {
  tab: OrdersTab
  search: string
  getTabCount: (tab: OrdersTab) => number
  onTabChange: (tab: OrdersTab) => void
  onSearchChange: (search: string) => void
}

export function OrdersToolbar({
  tab,
  search,
  getTabCount,
  onTabChange,
  onSearchChange,
}: OrdersToolbarProps) {
  return (
    <div className="flex min-w-0 flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
      <div className="-mx-1 min-w-0 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <Tabs
          value={tab}
          onValueChange={(value) =>
            onTabChange(value as OrdersTab)
          }
          className="w-max min-w-full"
        >
          <TabsList className="inline-flex h-auto min-w-max gap-1">
            {ORDER_TABS.map((item) => (
              <TabsTrigger
                key={item.value}
                value={item.value}
                className="gap-1.5 whitespace-nowrap px-3 text-xs sm:px-4 sm:text-sm"
              >
                <span>{item.label}</span>

                <span className="rounded-full bg-background/80 px-1.5 py-0.5 text-[10px] text-muted-foreground shadow-sm">
                  {getTabCount(item.value)}
                </span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      <div className="relative w-full shrink-0 xl:w-[320px]">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />

        <Input
          value={search}
          onChange={(event) =>
            onSearchChange(event.target.value)
          }
          placeholder="Search order, customer, phone or email…"
          className="h-10 w-full pl-9 pr-10"
        />

        {search && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Clear search"
            className="absolute right-1 top-1/2 size-8 -translate-y-1/2 text-muted-foreground"
            onClick={() => onSearchChange('')}
          >
            <X className="size-4" />
          </Button>
        )}
      </div>
    </div>
  )
}
