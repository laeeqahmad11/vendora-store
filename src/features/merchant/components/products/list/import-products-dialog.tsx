import * as React from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input, Textarea } from '@/components/ui/input'

interface ImportProductsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onImport: (text: string) => void
  importing: boolean
}

export function ImportProductsDialog({ open, onOpenChange, onImport, importing }: ImportProductsDialogProps) {
  const [text, setText] = React.useState('')

  const onFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]

    if (!file) return

    setText(await file.text())
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100%-2rem)] max-w-lg rounded-xl p-4 sm:p-6">
        <DialogHeader className="text-left">
          <DialogTitle>Import products from CSV</DialogTitle>

          <DialogDescription className="break-words">
            Columns: <code className="rounded bg-muted px-1">name,description,price,stock,categoryId</code>.
            Each row is created as a draft product.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Input type="file" accept=".csv,text/csv" onChange={onFile} className="w-full" />

          <Textarea
            rows={8}
            placeholder={'name,description,price,stock,categoryId\n"Blue mug","Ceramic mug",12.5,40,cat123'}
            value={text}
            onChange={(event) => setText(event.target.value)}
            className="min-h-44 resize-y font-mono text-xs"
          />
        </div>

        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:space-x-0">
          <Button
            type="button"
            variant="outline"
            className="w-full sm:w-auto"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>

          <Button
            type="button"
            className="w-full sm:w-auto"
            onClick={() => onImport(text)}
            loading={importing}
            disabled={!text.trim()}
          >
            Import drafts
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
