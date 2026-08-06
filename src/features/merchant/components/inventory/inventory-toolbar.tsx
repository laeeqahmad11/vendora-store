import { ChevronDown, Download, FileText, Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

interface InventoryToolbarProps {
  search: string
  onSearchChange: (value: string) => void
  onExportCsv: () => void
  onExportPdf: () => void
}

export function InventoryToolbar({
  search,
  onSearchChange,
  onExportCsv,
  onExportPdf,
}: InventoryToolbarProps) {
  return (
    <div className="flex min-w-0 flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="outline" className="w-full justify-center sm:w-auto">
            <Download className="size-4" />
            Export
            <ChevronDown className="size-4" />
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="start" className="w-[var(--radix-dropdown-menu-trigger-width)] min-w-44">
          <DropdownMenuItem onClick={onExportCsv}>
            <Download className="size-4" />
            Export CSV
          </DropdownMenuItem>

          <DropdownMenuItem onClick={onExportPdf}>
            <FileText className="size-4" />
            Export PDF
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <div className="relative w-full sm:max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />

        <Input
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search by product name or SKU..."
          className="w-full pl-9 pr-10"
        />

        {search && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Clear search"
            className="absolute right-1 top-1/2 size-8 -translate-y-1/2 text-muted-foreground"
            onClick={() => onSearchChange('')}
          >
            <X className="size-4" />
          </Button>
        )}
      </div>
    </div>
  )
}
