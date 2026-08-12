import type { FieldErrors, UseFormRegister } from 'react-hook-form'
import { FormField } from '@/components/shared/form-field'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { optionalNumber, type ProductFormValues } from '../product-form.schema'

interface InventorySectionProps {
  register: UseFormRegister<ProductFormValues>
  errors: FieldErrors<ProductFormValues>
  hasVariants: boolean
  variantStockTotal: number
}

export function InventorySection({ register, errors, hasVariants, variantStockTotal }: InventorySectionProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Inventory</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="SKU">
            <Input placeholder="SKU-001" {...register('sku')} />
          </FormField>
          <FormField label="Barcode">
            <Input placeholder="EAN / UPC" {...register('barcode')} />
          </FormField>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Stock" required error={errors.stock?.message}>
            {hasVariants ? (
              <>
                <Input type="number" value={variantStockTotal} readOnly aria-label="Total variant stock" />
                <p className="mt-1 text-xs text-muted-foreground">
                  Derived automatically from the variant stock rows.
                </p>
              </>
            ) : (
              <Input type="number" min="0" placeholder="0" {...register('stock', optionalNumber)} />
            )}
          </FormField>
          <FormField label="Low-stock alert at" error={errors.lowStockThreshold?.message}>
            <Input type="number" min="0" placeholder="5" {...register('lowStockThreshold', optionalNumber)} />
          </FormField>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Min order qty" error={errors.minOrderQty?.message}>
            <Input type="number" min="1" placeholder="1" {...register('minOrderQty', optionalNumber)} />
          </FormField>
          <FormField label="Max order qty" error={errors.maxOrderQty?.message}>
            <Input type="number" min="1" placeholder="10" {...register('maxOrderQty', optionalNumber)} />
          </FormField>
        </div>
      </CardContent>
    </Card>
  )
}
