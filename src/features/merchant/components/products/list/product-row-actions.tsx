import { Archive, ArchiveRestore, Copy, MoreHorizontal, Pencil, Send, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { Product } from '@/types'

interface ProductRowActionsProps {
  product: Product
  onEdit: (productId: string) => void
  onDuplicate: (product: Product) => void
  onSubmit: (productId: string) => void
  onArchive: (productId: string) => void
  onUnarchive: (productId: string) => void
  onDelete: (product: Product) => void
}

export function ProductRowActions({
  product,
  onEdit,
  onDuplicate,
  onSubmit,
  onArchive,
  onUnarchive,
  onDelete,
}: ProductRowActionsProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="ghost" size="icon-sm" aria-label="Product actions">
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => onEdit(product.id)}>
          <Pencil className="size-4" />
          Edit
        </DropdownMenuItem>

        <DropdownMenuItem onClick={() => onDuplicate(product)}>
          <Copy className="size-4" />
          Duplicate
        </DropdownMenuItem>

        {(product.status === 'draft' || product.status === 'rejected') && (
          <DropdownMenuItem onClick={() => onSubmit(product.id)}>
            <Send className="size-4" />
            Submit for review
          </DropdownMenuItem>
        )}

        {product.status === 'archived' ? (
          <DropdownMenuItem onClick={() => onUnarchive(product.id)}>
            <ArchiveRestore className="size-4" />
            Unarchive
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem onClick={() => onArchive(product.id)}>
            <Archive className="size-4" />
            Archive
          </DropdownMenuItem>
        )}

        <DropdownMenuSeparator />

        <DropdownMenuItem
          className="text-destructive focus:text-destructive"
          onClick={() => onDelete(product)}
        >
          <Trash2 className="size-4" />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
