import type { ElementType } from 'react'
import {
  Ban,
  CheckCircle2,
  Clock3,
  PackageCheck,
  ShoppingCart,
} from 'lucide-react'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { IN_PROGRESS_ORDER_STATUSES } from './orders.constants'
import type {
  OrdersTab,
  OrderSummaryCounts,
} from './orders.types'

interface SummaryCardProps {
  title: string
  value: number
  description: string
  icon: ElementType
  active: boolean
  onClick: () => void
}

interface OrdersSummaryCardsProps {
  isLoading: boolean
  totalOrders: number
  counts: OrderSummaryCounts
  activeTab: OrdersTab
  onTabChange: (tab: OrdersTab) => void
}

function SummaryCard({
  title,
  value,
  description,
  icon: Icon,
  active,
  onClick,
}: SummaryCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="min-w-0 text-left"
    >
      <Card
        className={cn(
          'h-full p-4 transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md',
          active &&
            'border-primary/40 bg-primary/[0.035] ring-1 ring-primary/10',
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm text-muted-foreground">
              {title}
            </p>

            <p className="mt-2 text-2xl font-bold tracking-tight">
              {value}
            </p>

            <p className="mt-1 truncate text-xs text-muted-foreground">
              {description}
            </p>
          </div>

          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Icon className="size-5" />
          </span>
        </div>
      </Card>
    </button>
  )
}

export function OrdersSummaryCards({
  isLoading,
  totalOrders,
  counts,
  activeTab,
  onTabChange,
}: OrdersSummaryCardsProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {Array.from({ length: 5 }).map(
          (_, index) => (
            <div
              key={index}
              className="h-[118px] animate-pulse rounded-xl border bg-muted/40"
            />
          ),
        )}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
      <SummaryCard
        title="Total Orders"
        value={totalOrders}
        description="All orders received"
        icon={ShoppingCart}
        active={activeTab === 'all'}
        onClick={() => onTabChange('all')}
      />

      <SummaryCard
        title="Pending"
        value={counts.pending}
        description="Awaiting confirmation"
        icon={Clock3}
        active={activeTab === 'pending'}
        onClick={() => onTabChange('pending')}
      />

      <SummaryCard
        title="In Progress"
        value={counts.inProgress}
        description="Being fulfilled"
        icon={PackageCheck}
        active={
          activeTab !== 'all' &&
          IN_PROGRESS_ORDER_STATUSES.includes(activeTab)
        }
        onClick={() => onTabChange('confirmed')}
      />

      <SummaryCard
        title="Completed"
        value={counts.completed}
        description="Successfully completed"
        icon={CheckCircle2}
        active={activeTab === 'completed'}
        onClick={() => onTabChange('completed')}
      />

      <SummaryCard
        title="Cancelled"
        value={counts.cancelled}
        description="Cancelled orders"
        icon={Ban}
        active={activeTab === 'cancelled'}
        onClick={() => onTabChange('cancelled')}
      />
    </div>
  )
}
