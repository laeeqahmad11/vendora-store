import { Link } from 'react-router-dom'
import { Package, Warehouse } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/misc'
import { TableSkeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatNumber } from '@/lib/utils'
import type { Product } from '@/types'
import type { StockTab } from './inventory.types'

interface InventoryTableProps {
  products: Product[]
  totalProducts: number
  isLoading: boolean
  searchTerm: string
  activeTab: StockTab
  onAdjustStock: (product: Product) => void
  onClearFilters: () => void
}

export function InventoryTable({
  products,
  totalProducts,
  isLoading,
  searchTerm,
  activeTab,
  onAdjustStock,
  onClearFilters,
}: InventoryTableProps) {
  if (isLoading) {
    return <TableSkeleton rows={6} />
  }

  if (products.length === 0) {
    return (
      <EmptyState
        icon={Warehouse}
        title={
          searchTerm
            ? 'No matching products'
            : activeTab === 'all'
              ? 'No products to track'
              : activeTab === 'low'
                ? 'No low-stock products'
                : 'Nothing out of stock'
        }
        description={
          searchTerm
            ? 'Try another product name or SKU.'
            : activeTab === 'all'
              ? 'Add products to start tracking inventory.'
              : 'You are all set here.'
        }
        action={
          searchTerm || activeTab !== 'all' ? (
            <Button type="button" variant="outline" onClick={onClearFilters}>
              Clear filters
            </Button>
          ) : (
            <Button asChild>
              <Link to="/merchant/products/new">Add product</Link>
            </Button>
          )
        }
      />
    )
  }

  return (
    <>
      <div className="min-w-0 overflow-hidden rounded-xl border bg-background">
        <div className="max-h-[520px] overflow-auto">
          <Table className="min-w-[900px]">
            <TableHeader className="sticky top-0 z-20 bg-background shadow-sm">
              <TableRow>
                <TableHead className="min-w-[240px]">Product</TableHead>
                <TableHead className="min-w-[120px]">SKU</TableHead>
                <TableHead className="min-w-[150px]">Stock</TableHead>
                <TableHead className="min-w-[120px]">Status</TableHead>
                <TableHead className="min-w-[130px]">Low-stock alert</TableHead>
                <TableHead className="min-w-[80px]">Sold</TableHead>
                <TableHead className="min-w-[100px] text-right">Adjust</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {products.map((product) => {
                const threshold = product.lowStockThreshold ?? 5
                const isOutOfStock = product.stock <= 0

                const isLowStock = product.stock > 0 && product.stock <= threshold

                const statusLabel = isOutOfStock ? 'Out of stock' : isLowStock ? 'Low stock' : 'In stock'

                const progressMax = Math.max(threshold * 4, product.stock, 1)

                const stockProgress = Math.min(100, Math.max(0, (product.stock / progressMax) * 100))

                return (
                  <TableRow key={product.id} className="transition-colors hover:bg-primary/[0.03]">
                    <TableCell>
                      <div className="flex min-w-0 items-center gap-3">
                        {product.images[0] ? (
                          <img
                            src={product.images[0]}
                            alt=""
                            className="size-10 shrink-0 rounded-lg border object-cover"
                          />
                        ) : (
                          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                            <Package className="size-4 text-muted-foreground" />
                          </span>
                        )}

                        <span className="max-w-[260px] truncate font-medium" title={product.name}>
                          {product.name}
                        </span>
                      </div>
                    </TableCell>

                    <TableCell className="text-muted-foreground">
                      <span className="block max-w-[140px] truncate" title={product.sku ?? ''}>
                        {product.sku ?? '—'}
                      </span>
                    </TableCell>

                    <TableCell>
                      <div className="min-w-[120px] space-y-2">
                        <div className="flex items-center justify-between gap-3">
                          <span
                            className={
                              isOutOfStock
                                ? 'font-semibold text-destructive'
                                : isLowStock
                                  ? 'font-semibold text-warning'
                                  : 'font-medium'
                            }
                          >
                            {formatNumber(product.stock)}
                          </span>

                          <span className="text-xs text-muted-foreground">units</span>
                        </div>

                        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                          <div
                            className={
                              isOutOfStock
                                ? 'h-full rounded-full bg-destructive transition-all'
                                : isLowStock
                                  ? 'h-full rounded-full bg-warning transition-all'
                                  : 'h-full rounded-full bg-success transition-all'
                            }
                            style={{
                              width: `${stockProgress}%`,
                            }}
                          />
                        </div>
                      </div>
                    </TableCell>

                    <TableCell>
                      <span
                        className={
                          isOutOfStock
                            ? 'inline-flex whitespace-nowrap rounded-full bg-destructive/10 px-2.5 py-1 text-xs font-medium text-destructive'
                            : isLowStock
                              ? 'inline-flex whitespace-nowrap rounded-full bg-warning/10 px-2.5 py-1 text-xs font-medium text-warning'
                              : 'inline-flex whitespace-nowrap rounded-full bg-success/10 px-2.5 py-1 text-xs font-medium text-success'
                        }
                      >
                        {statusLabel}
                      </span>
                    </TableCell>

                    <TableCell className="text-muted-foreground">{threshold}</TableCell>

                    <TableCell>{formatNumber(product.soldCount)}</TableCell>

                    <TableCell className="text-right">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => onAdjustStock(product)}
                      >
                        Adjust stock
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        Showing {products.length} of {totalProducts} {totalProducts === 1 ? 'product' : 'products'}
      </p>
    </>
  )
}
