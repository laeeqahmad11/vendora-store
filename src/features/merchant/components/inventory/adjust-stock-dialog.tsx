import * as React from 'react'
import toast from 'react-hot-toast'
import { Minus, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input, Textarea } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { FormField } from '@/components/shared/form-field'
import { formatNumber, getErrorMessage } from '@/lib/utils'
import type { Product } from '@/types'
import type { AdjustReason, StockAdjustment } from './inventory.types'

interface AdjustStockDialogProps {
  product: Product | null
  isPending: boolean
  onOpenChange: (open: boolean) => void
  onAdjust: (adjustment: StockAdjustment) => void
}

export function AdjustStockDialog({ product, isPending, onOpenChange, onAdjust }: AdjustStockDialogProps) {
  const [direction, setDirection] = React.useState<'add' | 'remove'>('add')
  const [quantity, setQuantity] = React.useState('1')
  const [reason, setReason] = React.useState<AdjustReason>('restock')
  const [note, setNote] = React.useState('')
  const [variantId, setVariantId] = React.useState('')

  React.useEffect(() => {
    if (product) {
      setDirection('add')
      setQuantity('1')
      setReason('restock')
      setNote('')
      setVariantId(product.variants?.[0]?.id ?? '')
    }
  }, [product])

  const submit = () => {
    if (!product) return

    try {
      const qty = Math.abs(Math.round(Number(quantity)))

      if (!Number.isFinite(qty) || qty <= 0) {
        throw new Error('Enter a valid quantity.')
      }

      const change = direction === 'remove' ? -qty : qty
      const selectedVariant = product.variants?.find((variant) => variant.id === variantId)

      if ((product.variants?.length ?? 0) > 0 && !selectedVariant) {
        throw new Error('Choose a variant to adjust.')
      }

      if ((selectedVariant?.stock ?? product.stock) + change < 0) {
        throw new Error('Stock cannot go below zero.')
      }

      onAdjust({
        product,
        ...(selectedVariant ? { variantId: selectedVariant.id } : {}),
        change,
        reason,
        note: note.trim(),
      })
    } catch (error) {
      toast.error(getErrorMessage(error))
    }
  }

  return (
    <Dialog open={!!product} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100%-2rem)] max-w-md rounded-xl p-4 sm:p-6">
        <DialogHeader className="text-left">
          <DialogTitle>Adjust stock</DialogTitle>

          <DialogDescription className="break-words">
            {product?.name} — current stock: {product ? formatNumber(product.stock) : ''}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {(product?.variants?.length ?? 0) > 0 && (
            <FormField label="Variant" required>
              <Select value={variantId} onValueChange={setVariantId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Choose a variant" />
                </SelectTrigger>
                <SelectContent>
                  {product?.variants?.map((variant) => (
                    <SelectItem key={variant.id} value={variant.id}>
                      {Object.values(variant.options).join(' / ')} ({formatNumber(variant.stock)} units)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
          )}
          <div className="grid grid-cols-1 gap-2 xs:grid-cols-2 sm:grid-cols-2">
            <Button
              type="button"
              className="w-full"
              variant={direction === 'add' ? 'default' : 'outline'}
              onClick={() => setDirection('add')}
            >
              <Plus className="size-4" />
              Add stock
            </Button>

            <Button
              type="button"
              className="w-full"
              variant={direction === 'remove' ? 'default' : 'outline'}
              onClick={() => setDirection('remove')}
            >
              <Minus className="size-4" />
              Remove stock
            </Button>
          </div>

          <FormField label="Quantity" required>
            <Input
              type="number"
              min="1"
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
            />
          </FormField>

          <FormField label="Reason" required>
            <Select value={reason} onValueChange={(value) => setReason(value as AdjustReason)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>

              <SelectContent>
                <SelectItem value="restock">Restock</SelectItem>
                <SelectItem value="adjustment">Adjustment / correction</SelectItem>
                <SelectItem value="return">Customer return</SelectItem>
              </SelectContent>
            </Select>
          </FormField>

          <FormField label="Note">
            <Textarea
              rows={2}
              placeholder="Optional note…"
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </FormField>
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

          <Button type="button" className="w-full sm:w-auto" loading={isPending} onClick={submit}>
            Apply adjustment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
