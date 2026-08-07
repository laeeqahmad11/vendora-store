import type { Dispatch, SetStateAction } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import type { ProductSpecification } from '../product-form.types'

interface SpecificationsSectionProps {
  specifications: ProductSpecification[]
  setSpecifications: Dispatch<SetStateAction<ProductSpecification[]>>
  markDirty: () => void
}

export function SpecificationsSection({
  specifications,
  setSpecifications,
  markDirty,
}: SpecificationsSectionProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Specifications</CardTitle>
        <CardDescription>Key facts shown as a table on the product page.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {specifications.map((specification, index) => (
          <div key={index} className="flex items-center gap-2">
            <Input
              placeholder="Label (e.g. Material)"
              value={specification.label}
              onChange={(event) => {
                setSpecifications((items) =>
                  items.map((item, itemIndex) =>
                    itemIndex === index ? { ...item, label: event.target.value } : item,
                  ),
                )
                markDirty()
              }}
              className="w-1/3"
            />
            <Input
              placeholder="Value (e.g. Stoneware)"
              value={specification.value}
              onChange={(event) => {
                setSpecifications((items) =>
                  items.map((item, itemIndex) =>
                    itemIndex === index ? { ...item, value: event.target.value } : item,
                  ),
                )
                markDirty()
              }}
              className="flex-1"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Remove specification"
              onClick={() => {
                setSpecifications((items) => items.filter((_, itemIndex) => itemIndex !== index))
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
          onClick={() => setSpecifications((items) => [...items, { label: '', value: '' }])}
        >
          <Plus /> Add specification
        </Button>
      </CardContent>
    </Card>
  )
}
