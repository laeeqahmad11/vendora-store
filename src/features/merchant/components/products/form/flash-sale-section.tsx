import type { FieldErrors, UseFormRegister, UseFormSetValue } from 'react-hook-form'
import { FormField } from '@/components/shared/form-field'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/misc'
import { optionalNumber, type ProductFormValues } from '../product-form.schema'

interface FlashSaleSectionProps {
  register: UseFormRegister<ProductFormValues>
  setValue: UseFormSetValue<ProductFormValues>
  errors: FieldErrors<ProductFormValues>
  active: boolean
}

export function FlashSaleSection({ register, setValue, errors, active }: FlashSaleSectionProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Flash sale</CardTitle>
          <Switch
            checked={active}
            onCheckedChange={(checked) =>
              setValue('flashSaleActive', checked === true, { shouldDirty: true })
            }
            aria-label="Toggle flash sale"
          />
        </div>
        <CardDescription>Time-limited sale price shown with a countdown.</CardDescription>
      </CardHeader>
      {active && (
        <CardContent className="space-y-4">
          <FormField label="Sale price (USD)" required error={errors.flashSalePrice?.message}>
            <Input
              type="number"
              step="0.01"
              min="0"
              placeholder="0.00"
              {...register('flashSalePrice', optionalNumber)}
            />
          </FormField>
          <FormField label="Ends at" required>
            <Input type="datetime-local" {...register('flashSaleEndsAt')} />
          </FormField>
        </CardContent>
      )}
    </Card>
  )
}
