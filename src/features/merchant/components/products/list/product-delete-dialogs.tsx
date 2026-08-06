import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import type { Product } from '@/types'

interface ProductDeleteDialogsProps {
  deleteTarget: Product | null
  bulkDeleteOpen: boolean
  selectedCount: number
  onDeleteTargetChange: (product: Product | null) => void
  onBulkDeleteOpenChange: (open: boolean) => void
  onDeleteProduct: () => Promise<void>
  onDeleteSelected: () => Promise<void>
}

export function ProductDeleteDialogs({
  deleteTarget,
  bulkDeleteOpen,
  selectedCount,
  onDeleteTargetChange,
  onBulkDeleteOpenChange,
  onDeleteProduct,
  onDeleteSelected,
}: ProductDeleteDialogsProps) {
  return (
    <>
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && onDeleteTargetChange(null)}
        title="Delete product?"
        description={`"${deleteTarget?.name}" will be permanently deleted. This cannot be undone.`}
        confirmLabel="Delete"
        destructive
        onConfirm={onDeleteProduct}
      />

      <ConfirmDialog
        open={bulkDeleteOpen}
        onOpenChange={onBulkDeleteOpenChange}
        title={`Delete ${selectedCount} products?`}
        description="All selected products will be permanently deleted. This cannot be undone."
        confirmLabel="Delete all"
        destructive
        onConfirm={onDeleteSelected}
      />
    </>
  )
}
