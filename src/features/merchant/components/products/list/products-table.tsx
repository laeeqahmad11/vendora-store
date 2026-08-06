import { Checkbox } from '@/components/ui/misc'
import { Table, TableBody, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { Product } from '@/types'
import { ProductTableRow } from './product-table-row'

interface ProductsTableProps {
  products: Product[]
  selected: Set<string>
  allVisibleSelected: boolean
  onToggleSelect: (productId: string) => void
  onToggleSelectAll: () => void
  onEdit: (productId: string) => void
  onDuplicate: (product: Product) => void
  onSubmit: (productId: string) => void
  onArchive: (productId: string) => void
  onUnarchive: (productId: string) => void
  onDelete: (product: Product) => void
}

export function ProductsTable({
  products,
  selected,
  allVisibleSelected,
  onToggleSelect,
  onToggleSelectAll,
  onEdit,
  onDuplicate,
  onSubmit,
  onArchive,
  onUnarchive,
  onDelete,
}: ProductsTableProps) {
  return (
    <div className="min-w-0 overflow-hidden rounded-xl border bg-background">
      <div className="max-h-[560px] overflow-auto">
        <Table className="min-w-[920px]">
          <TableHeader className="sticky top-0 z-20 bg-background shadow-sm">
            <TableRow className="bg-muted/30 hover:bg-muted/30">
              <TableHead className="w-12 min-w-12">
                <Checkbox
                  checked={allVisibleSelected}
                  onCheckedChange={onToggleSelectAll}
                  aria-label="Select all"
                />
              </TableHead>

              <TableHead className="min-w-[330px]">Product</TableHead>

              <TableHead className="min-w-[130px]">Price</TableHead>

              <TableHead className="min-w-[130px]">Stock</TableHead>

              <TableHead className="min-w-[150px]">Status</TableHead>

              <TableHead className="min-w-[90px]">Sold</TableHead>

              <TableHead className="w-14 min-w-14" />
            </TableRow>
          </TableHeader>

          <TableBody>
            {products.map((product) => (
              <ProductTableRow
                key={product.id}
                product={product}
                selected={selected.has(product.id)}
                onToggleSelect={onToggleSelect}
                onEdit={onEdit}
                onDuplicate={onDuplicate}
                onSubmit={onSubmit}
                onArchive={onArchive}
                onUnarchive={onUnarchive}
                onDelete={onDelete}
              />
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
