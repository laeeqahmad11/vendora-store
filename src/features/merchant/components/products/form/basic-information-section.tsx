import type { FieldErrors, UseFormRegister, UseFormWatch } from 'react-hook-form'
import { FormField } from '@/components/shared/form-field'
import { Input, Textarea } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { Brand, Category } from '@/types'
import type { ProductFormValues } from '../product-form.schema'
import type { ProductCatalogField } from '../product-form.types'

interface BasicInformationSectionProps {
  register: UseFormRegister<ProductFormValues>
  watch: UseFormWatch<ProductFormValues>
  errors: FieldErrors<ProductFormValues>
  categoryId: string
  categories: Category[]
  subcategories: Category[]
  brands: Brand[]
  onSelectField: (field: ProductCatalogField) => (value: string) => void
}

export function BasicInformationSection({
  register,
  watch,
  errors,
  categoryId,
  categories,
  subcategories,
  brands,
  onSelectField,
}: BasicInformationSectionProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Basic information</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <FormField label="Name" required error={errors.name?.message}>
          <Input placeholder="e.g. Handmade ceramic mug" {...register('name')} />
        </FormField>
        <FormField label="Description" required error={errors.description?.message}>
          <Textarea
            rows={5}
            placeholder="Describe materials, sizing, care instructions…"
            {...register('description')}
          />
        </FormField>
        <div className="grid gap-4 sm:grid-cols-3">
          <FormField label="Category" required error={errors.categoryId?.message}>
            <Select value={categoryId || undefined} onValueChange={onSelectField('categoryId')}>
              <SelectTrigger>
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((category) => (
                  <SelectItem key={category.id} value={category.id}>
                    {category.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          <FormField label="Subcategory">
            <Select
              value={watch('subcategoryId') || undefined}
              onValueChange={onSelectField('subcategoryId')}
              disabled={!categoryId || subcategories.length === 0}
            >
              <SelectTrigger>
                <SelectValue placeholder={categoryId ? 'Select subcategory' : 'Pick category first'} />
              </SelectTrigger>
              <SelectContent>
                {subcategories.map((subcategory) => (
                  <SelectItem key={subcategory.id} value={subcategory.id}>
                    {subcategory.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          <FormField label="Brand">
            <Select value={watch('brandId') || undefined} onValueChange={onSelectField('brandId')}>
              <SelectTrigger>
                <SelectValue placeholder="Select brand" />
              </SelectTrigger>
              <SelectContent>
                {brands.map((brand) => (
                  <SelectItem key={brand.id} value={brand.id}>
                    {brand.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
        </div>
        <FormField label="Tags" hint="Comma-separated, e.g. gift, handmade, ceramic">
          <Input placeholder="tag1, tag2, tag3" {...register('tags')} />
        </FormField>
      </CardContent>
    </Card>
  )
}
