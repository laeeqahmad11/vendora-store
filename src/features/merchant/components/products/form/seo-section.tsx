import type { UseFormRegister } from 'react-hook-form'
import { FormField } from '@/components/shared/form-field'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input, Textarea } from '@/components/ui/input'
import type { ProductFormValues } from '../product-form.schema'

interface SeoSectionProps {
  register: UseFormRegister<ProductFormValues>
}

export function SeoSection({ register }: SeoSectionProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>SEO</CardTitle>
        <CardDescription>Overrides the search-engine title & description.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <FormField label="SEO title">
          <Input placeholder="Defaults to product name" {...register('seoTitle')} />
        </FormField>
        <FormField label="SEO description">
          <Textarea rows={2} placeholder="Short summary for search results" {...register('seoDescription')} />
        </FormField>
      </CardContent>
    </Card>
  )
}
