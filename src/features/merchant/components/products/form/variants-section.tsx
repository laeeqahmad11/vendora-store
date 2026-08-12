import type { Dispatch, SetStateAction } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { FormField } from '@/components/shared/form-field'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import type { ProductOptionRow, ProductVariantRowState } from '../product-form.types'
import { productVariantComboKey } from '../product-form.utils'

interface VariantsSectionProps {
  optionRows: ProductOptionRow[]
  setOptionRows: Dispatch<SetStateAction<ProductOptionRow[]>>
  combos: Record<string, string>[]
  variantEdits: Record<string, ProductVariantRowState>
  setVariantEdits: Dispatch<SetStateAction<Record<string, ProductVariantRowState>>>
  markDirty: () => void
}

export function VariantsSection({
  optionRows,
  setOptionRows,
  combos,
  variantEdits,
  setVariantEdits,
  markDirty,
}: VariantsSectionProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Variants</CardTitle>
        <CardDescription>
          Define options like Color or Size — a variant row is generated for every combination.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {optionRows.map((row, index) => (
          <div key={index} className="flex flex-wrap items-end gap-2">
            <FormField label="Option name" className="w-36">
              <Input
                placeholder="Color"
                value={row.name}
                onChange={(event) => {
                  setOptionRows((rows) =>
                    rows.map((option, optionIndex) =>
                      optionIndex === index ? { ...option, name: event.target.value } : option,
                    ),
                  )
                  markDirty()
                }}
              />
            </FormField>
            <FormField label="Values (comma-separated)" className="min-w-0 flex-1">
              <Input
                placeholder="Red, Blue, Green"
                value={row.values}
                onChange={(event) => {
                  setOptionRows((rows) =>
                    rows.map((option, optionIndex) =>
                      optionIndex === index ? { ...option, values: event.target.value } : option,
                    ),
                  )
                  markDirty()
                }}
              />
            </FormField>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Remove option"
              onClick={() => {
                setOptionRows((rows) => rows.filter((_, optionIndex) => optionIndex !== index))
                markDirty()
              }}
            >
              <Trash2 />
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            setOptionRows((rows) => [...rows, { name: '', values: '' }])
            markDirty()
          }}
        >
          <Plus /> Add option
        </Button>

        {combos.length > 0 && (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                  <th className="p-2.5 font-semibold">Variant</th>
                  <th className="p-2.5 font-semibold">Price override</th>
                  <th className="p-2.5 font-semibold">Stock</th>
                  <th className="p-2.5 font-semibold">SKU</th>
                </tr>
              </thead>
              <tbody>
                {combos.map((combo) => {
                  const key = productVariantComboKey(combo)
                  const edit = variantEdits[key] ?? { price: '', stock: '', sku: '' }
                  const setEdit = (patch: Partial<ProductVariantRowState>) => {
                    setVariantEdits((previous) => ({
                      ...previous,
                      [key]: { ...edit, ...patch },
                    }))
                    markDirty()
                  }
                  return (
                    <tr key={key} className="border-b last:border-0">
                      <td className="whitespace-nowrap p-2.5 font-medium">
                        {Object.values(combo).join(' / ')}
                      </td>
                      <td className="p-2.5">
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="Base price"
                          className="h-8 w-28"
                          value={edit.price}
                          onChange={(event) => setEdit({ price: event.target.value })}
                        />
                      </td>
                      <td className="p-2.5">
                        <Input
                          type="number"
                          step="1"
                          min="0"
                          placeholder="0"
                          className="h-8 w-24"
                          value={edit.stock}
                          onChange={(event) => setEdit({ stock: event.target.value })}
                        />
                      </td>
                      <td className="p-2.5">
                        <Input
                          placeholder="SKU"
                          className="h-8 w-32"
                          value={edit.sku}
                          onChange={(event) => setEdit({ sku: event.target.value })}
                        />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
