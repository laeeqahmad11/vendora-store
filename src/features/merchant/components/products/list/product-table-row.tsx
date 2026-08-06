import { Link } from 'react-router-dom'
import { Package } from 'lucide-react'
import { Checkbox } from '@/components/ui/misc'
import { TableCell, TableRow } from '@/components/ui/table'
import { formatCurrency, formatNumber } from '@/lib/utils'
import type { Product } from '@/types'
import { ProductStatusBadge } from '../../common'
import { isLowStock } from '../products.utils'
import { ProductRowActions } from './product-row-actions'

interface ProductTableRowProps {
  product: Product
  selected: boolean
  onToggleSelect: (productId: string) => void
  onEdit: (productId: string) => void
  onDuplicate: (product: Product) => void
  onSubmit: (productId: string) => void
  onArchive: (productId: string) => void
  onUnarchive: (productId: string) => void
  onDelete: (product: Product) => void
}

export function ProductTableRow({
  product,
  selected,
  onToggleSelect,
  onEdit,
  onDuplicate,
  onSubmit,
  onArchive,
  onUnarchive,
  onDelete,
}: ProductTableRowProps) {
  const low = isLowStock(product)

  return (
    <TableRow className="transition-colors hover:bg-primary/[0.03]">
      <TableCell>
        <Checkbox
          checked={selected}
          onCheckedChange={() => onToggleSelect(product.id)}
          aria-label={`Select ${product.name}`}
        />
      </TableCell>

      <TableCell>
        <div className="flex min-w-0 items-center gap-3">
          {product.images[0] ? (
            <img src={product.images[0]} alt="" className="size-11 shrink-0 rounded-lg border object-cover" />
          ) : (
            <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-muted">
              <Package className="size-4 text-muted-foreground" />
            </span>
          )}

          <div className="min-w-0">
            <Link
              to={`/merchant/products/${product.id}/edit`}
              className="block max-w-[280px] truncate font-semibold transition-colors hover:text-primary"
              title={product.name}
            >
              {product.name}
            </Link>

            {product.sku && (
              <p
                className="mt-0.5 max-w-[280px] truncate text-xs text-muted-foreground"
                title={`SKU ${product.sku}`}
              >
                SKU {product.sku}
              </p>
            )}
          </div>
        </div>
      </TableCell>

      <TableCell className="whitespace-nowrap font-semibold">
        {formatCurrency(product.price, product.currency)}
      </TableCell>

      <TableCell>
        <div className="flex items-center gap-2">
          <span className="font-medium">{formatNumber(product.stock)}</span>

          {product.stock <= 0 ? (
            <span className="inline-flex whitespace-nowrap rounded-full bg-destructive/10 px-2.5 py-1 text-xs font-medium text-destructive">
              Out
            </span>
          ) : low ? (
            <span className="inline-flex whitespace-nowrap rounded-full bg-warning/10 px-2.5 py-1 text-xs font-medium text-warning">
              Low
            </span>
          ) : null}
        </div>
      </TableCell>

      <TableCell>
        <ProductStatusBadge status={product.status} />

        {product.status === 'rejected' && product.rejectionReason && (
          <p className="mt-1 max-w-[220px] truncate text-xs text-destructive" title={product.rejectionReason}>
            {product.rejectionReason}
          </p>
        )}
      </TableCell>

      <TableCell className="font-medium">{formatNumber(product.soldCount)}</TableCell>

      <TableCell className="text-right">
        <ProductRowActions
          product={product}
          onEdit={onEdit}
          onDuplicate={onDuplicate}
          onSubmit={onSubmit}
          onArchive={onArchive}
          onUnarchive={onUnarchive}
          onDelete={onDelete}
        />
      </TableCell>
    </TableRow>
  )
}
