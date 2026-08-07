import type { FieldErrors, UseFormRegister } from 'react-hook-form'
import { FormField } from '@/components/shared/form-field'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { optionalNumber, type ProductFormValues } from '../product-form.schema'

interface PricingSectionProps {
  register: UseFormRegister<ProductFormValues>
  errors: FieldErrors<ProductFormValues>
}

export function PricingSection({ register, errors }: PricingSectionProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Pricing</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <FormField label="Price (USD)" required error={errors.price?.message}>
          <Input
            type="number"
            step="0.01"
            min="0"
            placeholder="0.00"
            {...register('price', optionalNumber)}
          />
        </FormField>
        <FormField
          label="Compare-at price"
          error={errors.compareAtPrice?.message}
          hint="Shown struck-through to highlight a discount."
        >
          <Input
            type="number"
            step="0.01"
            min="0"
            placeholder="0.00"
            {...register('compareAtPrice', optionalNumber)}
          />
        </FormField>
        <FormField label="Currency">
          <Input value="USD" disabled />
        </FormField>
      </CardContent>
    </Card>
  )
}
