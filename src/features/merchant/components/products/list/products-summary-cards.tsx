import type { ElementType } from 'react'
import { AlertTriangle, CheckCircle2, Clock3, Package } from 'lucide-react'
import { cn, formatNumber } from '@/lib/utils'
import type { ProductCounts, ProductTab } from '../products.types'

interface SummaryCardProps {
  title: string
  value: number
  description: string
  icon: ElementType
  active: boolean
  onClick: () => void
  tone?: 'default' | 'warning'
}

function SummaryCard({
  title,
  value,
  description,
  icon: Icon,
  active,
  onClick,
  tone = 'default',
}: SummaryCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'group min-w-0 rounded-xl border bg-card p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:p-5',
        active && 'border-primary/45 bg-primary/[0.04] ring-1 ring-primary/20',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm text-muted-foreground">{title}</p>

          <p
            className={cn(
              'mt-1 text-2xl font-bold tracking-tight',
              tone === 'warning' && value > 0 && 'text-warning',
            )}
          >
            {formatNumber(value)}
          </p>

          <p className="mt-1 truncate text-xs text-muted-foreground">{description}</p>
        </div>

        <span
          className={cn(
            'flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary transition-transform group-hover:scale-105',
            tone === 'warning' && 'bg-warning/10 text-warning',
          )}
        >
          <Icon className="size-5" />
        </span>
      </div>
    </button>
  )
}

interface ProductsSummaryCardsProps {
  counts: ProductCounts
  tab: ProductTab
  lowStockOnly: boolean
  onTabChange: (tab: ProductTab) => void
  onLowStockOnlyChange: (lowStockOnly: boolean) => void
}

export function ProductsSummaryCards({
  counts,
  tab,
  lowStockOnly,
  onTabChange,
  onLowStockOnlyChange,
}: ProductsSummaryCardsProps) {
  return (
    <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <SummaryCard
        title="Total products"
        value={counts.all}
        description="All catalog products"
        icon={Package}
        active={tab === 'all' && !lowStockOnly}
        onClick={() => {
          onTabChange('all')
          onLowStockOnlyChange(false)
        }}
      />

      <SummaryCard
        title="Approved"
        value={counts.approved}
        description="Currently available"
        icon={CheckCircle2}
        active={tab === 'approved' && !lowStockOnly}
        onClick={() => {
          onTabChange('approved')
          onLowStockOnlyChange(false)
        }}
      />

      <SummaryCard
        title="Pending review"
        value={counts.pending}
        description="Waiting for approval"
        icon={Clock3}
        active={tab === 'pending' && !lowStockOnly}
        onClick={() => {
          onTabChange('pending')
          onLowStockOnlyChange(false)
        }}
      />

      <SummaryCard
        title="Low stock"
        value={counts.lowStock}
        description="Needs attention"
        icon={AlertTriangle}
        tone="warning"
        active={lowStockOnly}
        onClick={() => {
          onTabChange('all')
          onLowStockOnlyChange(true)
        }}
      />
    </div>
  )
}
