import { Link } from 'react-router-dom'
import { Download, Plus, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface ProductsPageActionsProps {
  exportDisabled: boolean
  onImport: () => void
  onExport: () => void
}

export function ProductsPageActions({ exportDisabled, onImport, onExport }: ProductsPageActionsProps) {
  return (
    <div className="flex w-full flex-wrap gap-2 sm:w-auto">
      <Button type="button" variant="outline" size="sm" className="flex-1 sm:flex-none" onClick={onImport}>
        <Upload className="size-4" />
        Import
      </Button>

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="flex-1 sm:flex-none"
        onClick={onExport}
        disabled={exportDisabled}
      >
        <Download className="size-4" />
        Export
      </Button>

      <Button asChild size="sm" className="w-full sm:w-auto">
        <Link to="/merchant/products/new">
          <Plus className="size-4" />
          Add product
        </Link>
      </Button>
    </div>
  )
}
