import { Archive, Send, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface ProductsBulkActionBarProps {
  selectedCount: number
  onClear: () => void
  onSubmit: () => void
  onArchive: () => void
  onDelete: () => void
}

export function ProductsBulkActionBar({
  selectedCount,
  onClear,
  onSubmit,
  onArchive,
  onDelete,
}: ProductsBulkActionBarProps) {
  if (selectedCount === 0) return null

  return (
    <div className="flex min-w-0 flex-col gap-3 rounded-xl border bg-card p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:px-4 sm:py-3">
      <div className="flex items-center justify-between gap-3">
        <p className="whitespace-nowrap text-sm font-semibold">{selectedCount} selected</p>

        <Button type="button" variant="ghost" size="sm" className="sm:hidden" onClick={onClear}>
          Clear
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap">
        <Button type="button" variant="outline" size="sm" className="w-full sm:w-auto" onClick={onSubmit}>
          <Send className="size-4" />
          Submit for review
        </Button>

        <Button type="button" variant="outline" size="sm" className="w-full sm:w-auto" onClick={onArchive}>
          <Archive className="size-4" />
          Archive
        </Button>

        <Button type="button" variant="destructive" size="sm" className="w-full sm:w-auto" onClick={onDelete}>
          <Trash2 className="size-4" />
          Delete
        </Button>
      </div>
    </div>
  )
}
