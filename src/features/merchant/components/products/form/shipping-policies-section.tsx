import type { UseFormRegister } from 'react-hook-form'
import { FormField } from '@/components/shared/form-field'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input, Textarea } from '@/components/ui/input'
import type { ProductFormValues } from '../product-form.schema'

interface ShippingPoliciesSectionProps {
  register: UseFormRegister<ProductFormValues>
}

export function ShippingPoliciesSection({ register }: ShippingPoliciesSectionProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Shipping & policies</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Weight">
            <Input placeholder="e.g. 450 g" {...register('weight')} />
          </FormField>
          <FormField label="Dimensions">
            <Input placeholder="e.g. 10 × 10 × 12 cm" {...register('dimensions')} />
          </FormField>
        </div>
        <FormField label="Warranty">
          <Input placeholder="e.g. 12-month manufacturer warranty" {...register('warranty')} />
        </FormField>
        <FormField label="Return policy">
          <Textarea
            rows={2}
            placeholder="e.g. Returns accepted within 14 days…"
            {...register('returnPolicy')}
          />
        </FormField>
        <FormField label="Shipping info">
          <Textarea rows={2} placeholder="e.g. Ships within 2 business days…" {...register('shippingInfo')} />
        </FormField>
      </CardContent>
    </Card>
  )
}
