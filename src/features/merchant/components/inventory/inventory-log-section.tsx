import { History } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/misc'
import { TableSkeleton } from '@/components/ui/skeleton'
import { timeAgo } from '@/lib/utils'
import type { InventoryLog } from '@/types'
import { ErrorState } from '../common'

interface InventoryLogSectionProps {
  logs: InventoryLog[]
  isLoading: boolean
  isError: boolean
  onRetry: () => void
}

export function InventoryLogSection({ logs, isLoading, isError, onRetry }: InventoryLogSectionProps) {
  return (
    <Card className="min-w-0 overflow-hidden">
      <CardHeader className="border-b p-4 sm:p-6">
        <CardTitle className="flex items-center gap-2">
          <History className="size-4 shrink-0" />
          Inventory log
        </CardTitle>

        <CardDescription>The 50 most recent stock movements.</CardDescription>
      </CardHeader>

      <CardContent className="max-h-[420px] overflow-y-auto p-4 sm:p-6">
        {isLoading ? (
          <TableSkeleton rows={4} />
        ) : isError ? (
          <ErrorState onRetry={onRetry} />
        ) : logs.length === 0 ? (
          <EmptyState
            icon={History}
            title="No stock movements yet"
            description="Adjustments will appear here."
            className="py-8"
          />
        ) : (
          <div className="space-y-3">
            {logs.map((log) => {
              const isPositive = log.change >= 0

              const reasonLabel =
                log.reason === 'restock'
                  ? 'Restock'
                  : log.reason === 'return'
                    ? 'Customer return'
                    : 'Adjustment'

              return (
                <div
                  key={log.id}
                  className="flex min-w-0 flex-col gap-3 rounded-xl border p-3 transition hover:bg-muted/40 sm:flex-row sm:items-start sm:justify-between sm:p-4"
                >
                  <div className="flex min-w-0 gap-3 sm:gap-4">
                    <div
                      className={
                        isPositive
                          ? 'flex size-9 shrink-0 items-center justify-center rounded-full bg-success/10 font-bold text-success sm:size-10'
                          : 'flex size-9 shrink-0 items-center justify-center rounded-full bg-destructive/10 font-bold text-destructive sm:size-10'
                      }
                    >
                      {isPositive ? '+' : '−'}
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold" title={log.productName}>
                        {log.productName}
                      </p>

                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                          {reasonLabel}
                        </span>

                        <span className="text-xs text-muted-foreground">By merchant</span>
                      </div>

                      {log.note && (
                        <p className="mt-2 break-words text-sm text-muted-foreground">{log.note}</p>
                      )}
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center justify-between border-t pt-3 sm:block sm:border-0 sm:pt-0 sm:text-right">
                    <p className={isPositive ? 'font-bold text-success' : 'font-bold text-destructive'}>
                      {isPositive ? `+${log.change}` : log.change}
                    </p>

                    <p className="whitespace-nowrap text-xs text-muted-foreground sm:mt-1">
                      {timeAgo(log.createdAt)}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
