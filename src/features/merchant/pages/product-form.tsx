import * as React from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input, Textarea } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch, Spinner, EmptyState } from '@/components/ui/misc'
import { FormField } from '@/components/shared/form-field'
import { ImageUploader } from '@/components/shared/image-uploader'
import { PageHeader } from '@/layouts/dashboard-layout'
import { productsService } from '@/services/products.service'
import { catalogService } from '@/services/catalog.service'
import { getErrorMessage } from '@/lib/utils'
import type { Product, ProductVariant } from '@/types'
import { localInputToMs, msToLocalInput, useMerchant } from '../components/common'

// ------------------------------------------------------------------ schema

const schema = z.object({
  name: z.string().min(3, 'Product name must be at least 3 characters'),
  description: z.string().min(10, 'Description must be at least 10 characters'),
  categoryId: z.string().min(1, 'Choose a category'),
  subcategoryId: z.string().optional(),
  brandId: z.string().optional(),
  tags: z.string().optional(),
  price: z.number('Enter a price').positive('Price must be greater than 0'),
  compareAtPrice: z.number().positive().optional(),
  sku: z.string().optional(),
  barcode: z.string().optional(),
  stock: z.number('Enter stock quantity').int().min(0),
  lowStockThreshold: z.number().int().min(0).optional(),
  minOrderQty: z.number().int().min(1).optional(),
  maxOrderQty: z.number().int().min(1).optional(),
  weight: z.string().optional(),
  dimensions: z.string().optional(),
  warranty: z.string().optional(),
  returnPolicy: z.string().optional(),
  shippingInfo: z.string().optional(),
  seoTitle: z.string().optional(),
  seoDescription: z.string().optional(),
  flashSaleActive: z.boolean(),
  flashSalePrice: z.number().positive().optional(),
  flashSaleEndsAt: z.string().optional(),
})

type FormValues = z.infer<typeof schema>

const optionalNumber = { setValueAs: (v: unknown) => (v === '' || v == null ? undefined : Number(v)) }

// --------------------------------------------------------- variants state

interface OptionRow {
  name: string
  values: string // comma-separated
}

interface VariantRowState {
  price: string
  stock: string
  sku: string
}

function parseOptions(rows: OptionRow[]): Record<string, string[]> {
  const out: Record<string, string[]> = {}
  for (const row of rows) {
    const name = row.name.trim()
    const values = row.values
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean)
    if (name && values.length) out[name] = values
  }
  return out
}

/** Cartesian product of option values → list of { OptionName: value } combos */
function buildCombos(options: Record<string, string[]>): Record<string, string>[] {
  const names = Object.keys(options)
  if (!names.length) return []
  return names.reduce<Record<string, string>[]>(
    (acc, name) => acc.flatMap((combo) => options[name].map((v) => ({ ...combo, [name]: v }))),
    [{}],
  )
}

const comboKey = (combo: Record<string, string>) =>
  Object.keys(combo)
    .sort()
    .map((k) => `${k}:${combo[k]}`)
    .join('|')

// -------------------------------------------------------------------- page

export default function ProductFormPage() {
  const { store, actor } = useMerchant()
  const { productId } = useParams()
  const isEdit = !!productId
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const productQ = useQuery({
    queryKey: ['merchant-product', productId],
    queryFn: () => productsService.getById(productId!),
    enabled: isEdit,
  })
  const categoriesQ = useQuery({ queryKey: ['catalog-top-categories'], queryFn: () => catalogService.listTopCategories() })
  const brandsQ = useQuery({ queryKey: ['catalog-brands'], queryFn: () => catalogService.listBrands() })

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { flashSaleActive: false, tags: '' },
  })

  const categoryId = watch('categoryId')
  const flashSaleActive = watch('flashSaleActive')

  const subcategoriesQ = useQuery({
    queryKey: ['catalog-subcategories', categoryId],
    queryFn: () => catalogService.listSubcategories(categoryId),
    enabled: !!categoryId,
  })

  const [images, setImages] = React.useState<string[]>([])
  const [optionRows, setOptionRows] = React.useState<OptionRow[]>([])
  const [variantEdits, setVariantEdits] = React.useState<Record<string, VariantRowState>>({})
  const [specs, setSpecs] = React.useState<{ label: string; value: string }[]>([])
  const [extrasDirty, setExtrasDirty] = React.useState(false)
  const [hydrated, setHydrated] = React.useState(!isEdit)

  const markDirty = () => setExtrasDirty(true)

  // Populate form when editing
  React.useEffect(() => {
    const p = productQ.data
    if (!isEdit || !p) return
    reset({
      name: p.name,
      description: p.description,
      categoryId: p.categoryId,
      subcategoryId: p.subcategoryId ?? '',
      brandId: p.brandId ?? '',
      tags: p.tags.join(', '),
      price: p.price,
      compareAtPrice: p.compareAtPrice ?? undefined,
      sku: p.sku ?? '',
      barcode: p.barcode ?? '',
      stock: p.stock,
      lowStockThreshold: p.lowStockThreshold,
      minOrderQty: p.minOrderQty,
      maxOrderQty: p.maxOrderQty,
      weight: p.weight ?? '',
      dimensions: p.dimensions ?? '',
      warranty: p.warranty ?? '',
      returnPolicy: p.returnPolicy ?? '',
      shippingInfo: p.shippingInfo ?? '',
      seoTitle: p.seo?.title ?? '',
      seoDescription: p.seo?.description ?? '',
      flashSaleActive: p.flashSale?.active ?? false,
      flashSalePrice: p.flashSale?.salePrice,
      flashSaleEndsAt: p.flashSale?.endsAt ? msToLocalInput(p.flashSale.endsAt) : '',
    })
    setImages(p.images)
    setSpecs(p.specifications ?? [])
    setOptionRows(
      Object.entries(p.variantOptions ?? {}).map(([name, values]) => ({ name, values: values.join(', ') })),
    )
    const edits: Record<string, VariantRowState> = {}
    for (const v of p.variants ?? []) {
      edits[comboKey(v.options)] = {
        price: v.price != null ? String(v.price) : '',
        stock: String(v.stock),
        sku: v.sku ?? '',
      }
    }
    setVariantEdits(edits)
    setExtrasDirty(false)
    setHydrated(true)
  }, [isEdit, productQ.data, reset])

  // Unsaved-changes warning
  const dirty = isDirty || extrasDirty
  React.useEffect(() => {
    if (!dirty) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirty])

  const variantOptions = React.useMemo(() => parseOptions(optionRows), [optionRows])
  const combos = React.useMemo(() => buildCombos(variantOptions), [variantOptions])

  const buildVariants = (baseStock: number): ProductVariant[] =>
    combos.map((combo) => {
      const key = comboKey(combo)
      const edit = variantEdits[key]
      const price = edit?.price ? Number(edit.price) : undefined
      const stock = edit?.stock ? Number(edit.stock) : baseStock
      return {
        id: key.replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase() || 'default',
        options: combo,
        ...(price != null && Number.isFinite(price) ? { price } : {}),
        stock: Number.isFinite(stock) ? Math.max(0, Math.round(stock)) : Math.max(0, baseStock),
        ...(edit?.sku ? { sku: edit.sku } : {}),
      }
    })

  const save = async (values: FormValues, submitForReview: boolean) => {
    if (images.length === 0) {
      toast.error('Add at least one product image.')
      return
    }
    const variants = buildVariants(values.stock)
    const specifications = specs.filter((s) => s.label.trim() && s.value.trim())
    const flashSale =
      values.flashSaleActive && values.flashSalePrice && values.flashSaleEndsAt
        ? {
            active: true,
            salePrice: values.flashSalePrice,
            endsAt: localInputToMs(values.flashSaleEndsAt) ?? Date.now(),
          }
        : null
    if (values.flashSaleActive && !flashSale) {
      toast.error('Flash sale needs both a sale price and an end date.')
      return
    }

    const payload = {
      name: values.name,
      description: values.description,
      images,
      price: values.price,
      compareAtPrice: values.compareAtPrice ?? null,
      currency: 'USD',
      sku: values.sku || undefined,
      barcode: values.barcode || undefined,
      stock: values.stock,
      lowStockThreshold: values.lowStockThreshold,
      minOrderQty: values.minOrderQty,
      maxOrderQty: values.maxOrderQty,
      categoryId: values.categoryId,
      subcategoryId: values.subcategoryId || undefined,
      brandId: values.brandId || undefined,
      tags: (values.tags ?? '')
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
      variantOptions: Object.keys(variantOptions).length ? variantOptions : undefined,
      variants: variants.length ? variants : undefined,
      specifications: specifications.length ? specifications : undefined,
      weight: values.weight || undefined,
      dimensions: values.dimensions || undefined,
      warranty: values.warranty || undefined,
      returnPolicy: values.returnPolicy || undefined,
      shippingInfo: values.shippingInfo || undefined,
      seo:
        values.seoTitle || values.seoDescription
          ? { title: values.seoTitle || undefined, description: values.seoDescription || undefined }
          : undefined,
      flashSale,
    }

    try {
      if (isEdit && productQ.data) {
        const status = submitForReview ? 'pending' : productQ.data.status
        await productsService.update(productQ.data.id, {
          ...payload,
          status,
          ...(submitForReview ? { rejectionReason: '' } : {}),
        } as Partial<Product>)
        toast.success(submitForReview ? 'Product updated & submitted for review' : 'Product updated')
      } else {
        await productsService.create({
          ...payload,
          storeId: store.id,
          merchantId: actor.id,
          status: submitForReview ? 'pending' : 'draft',
        })
        toast.success(submitForReview ? 'Product created & submitted for review' : 'Draft saved')
      }
      setExtrasDirty(false)
      reset(values) // clears isDirty so the beforeunload guard is lifted
      await queryClient.invalidateQueries({ queryKey: ['merchant-products', store.id] })
      await queryClient.invalidateQueries({ queryKey: ['merchant-product', productId] })
      navigate('/merchant/products')
    } catch (e) {
      toast.error(getErrorMessage(e))
    }
  }

  if (isEdit && productQ.isLoading) return <Spinner />
  if (isEdit && !productQ.isLoading && !productQ.data) {
    return (
      <EmptyState
        title="Product not found"
        description="It may have been deleted."
        action={<Button onClick={() => navigate('/merchant/products')}>Back to products</Button>}
      />
    )
  }
  if (!hydrated) return <Spinner />

  const status = productQ.data?.status
  const canSubmitForReview = !isEdit || status === 'draft' || status === 'rejected'

  const selectField = (field: 'categoryId' | 'subcategoryId' | 'brandId') => (value: string) => {
    setValue(field, value, { shouldDirty: true, shouldValidate: true })
    if (field === 'categoryId') setValue('subcategoryId', '', { shouldDirty: true })
  }

  return (
    <form className="space-y-6" onSubmit={handleSubmit((v) => save(v, false))}>
      <PageHeader
        title={isEdit ? 'Edit product' : 'New product'}
        description={
          isEdit
            ? `Editing "${productQ.data?.name}"${status ? ` — status: ${status}` : ''}`
            : 'Products go live after admin approval.'
        }
        actions={
          <>
            <Button type="button" variant="outline" onClick={() => navigate('/merchant/products')}>
              Cancel
            </Button>
            <Button type="submit" variant={canSubmitForReview ? 'secondary' : 'default'} loading={isSubmitting}>
              {isEdit ? 'Save changes' : 'Save as draft'}
            </Button>
            {canSubmitForReview && (
              <Button type="button" loading={isSubmitting} onClick={handleSubmit((v) => save(v, true))}>
                Save & submit for review
              </Button>
            )}
          </>
        }
      />

      {status === 'rejected' && productQ.data?.rejectionReason && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm">
          <span className="font-medium text-destructive">Rejected:</span> {productQ.data.rejectionReason}
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          {/* Basic info */}
          <Card>
            <CardHeader>
              <CardTitle>Basic information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField label="Name" required error={errors.name?.message}>
                <Input placeholder="e.g. Handmade ceramic mug" {...register('name')} />
              </FormField>
              <FormField label="Description" required error={errors.description?.message}>
                <Textarea rows={5} placeholder="Describe materials, sizing, care instructions…" {...register('description')} />
              </FormField>
              <div className="grid gap-4 sm:grid-cols-3">
                <FormField label="Category" required error={errors.categoryId?.message}>
                  <Select value={categoryId || undefined} onValueChange={selectField('categoryId')}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      {(categoriesQ.data ?? []).map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormField>
                <FormField label="Subcategory">
                  <Select
                    value={watch('subcategoryId') || undefined}
                    onValueChange={selectField('subcategoryId')}
                    disabled={!categoryId || (subcategoriesQ.data ?? []).length === 0}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={categoryId ? 'Select subcategory' : 'Pick category first'} />
                    </SelectTrigger>
                    <SelectContent>
                      {(subcategoriesQ.data ?? []).map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormField>
                <FormField label="Brand">
                  <Select value={watch('brandId') || undefined} onValueChange={selectField('brandId')}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select brand" />
                    </SelectTrigger>
                    <SelectContent>
                      {(brandsQ.data ?? []).map((b) => (
                        <SelectItem key={b.id} value={b.id}>
                          {b.name}
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

          {/* Images */}
          <Card>
            <CardHeader>
              <CardTitle>Images</CardTitle>
              <CardDescription>First image is the cover. Up to 8 images.</CardDescription>
            </CardHeader>
            <CardContent>
              <ImageUploader
                value={images}
                onChange={(urls) => {
                  setImages(urls)
                  markDirty()
                }}
                folder={`stores/${store.id}/products`}
              />
            </CardContent>
          </Card>

          {/* Variants */}
          <Card>
            <CardHeader>
              <CardTitle>Variants</CardTitle>
              <CardDescription>
                Define options like Color or Size — a variant row is generated for every combination.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {optionRows.map((row, i) => (
                <div key={i} className="flex flex-wrap items-end gap-2">
                  <FormField label="Option name" className="w-36">
                    <Input
                      placeholder="Color"
                      value={row.name}
                      onChange={(e) => {
                        setOptionRows((rows) => rows.map((r, j) => (j === i ? { ...r, name: e.target.value } : r)))
                        markDirty()
                      }}
                    />
                  </FormField>
                  <FormField label="Values (comma-separated)" className="min-w-0 flex-1">
                    <Input
                      placeholder="Red, Blue, Green"
                      value={row.values}
                      onChange={(e) => {
                        setOptionRows((rows) => rows.map((r, j) => (j === i ? { ...r, values: e.target.value } : r)))
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
                      setOptionRows((rows) => rows.filter((_, j) => j !== i))
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
                onClick={() => setOptionRows((rows) => [...rows, { name: '', values: '' }])}
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
                        const key = comboKey(combo)
                        const edit = variantEdits[key] ?? { price: '', stock: '', sku: '' }
                        const setEdit = (patch: Partial<VariantRowState>) => {
                          setVariantEdits((prev) => ({ ...prev, [key]: { ...edit, ...patch } }))
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
                                onChange={(e) => setEdit({ price: e.target.value })}
                              />
                            </td>
                            <td className="p-2.5">
                              <Input
                                type="number"
                                min="0"
                                placeholder="Base stock"
                                className="h-8 w-24"
                                value={edit.stock}
                                onChange={(e) => setEdit({ stock: e.target.value })}
                              />
                            </td>
                            <td className="p-2.5">
                              <Input
                                placeholder="SKU"
                                className="h-8 w-32"
                                value={edit.sku}
                                onChange={(e) => setEdit({ sku: e.target.value })}
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

          {/* Specifications */}
          <Card>
            <CardHeader>
              <CardTitle>Specifications</CardTitle>
              <CardDescription>Key facts shown as a table on the product page.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {specs.map((spec, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    placeholder="Label (e.g. Material)"
                    value={spec.label}
                    onChange={(e) => {
                      setSpecs((s) => s.map((r, j) => (j === i ? { ...r, label: e.target.value } : r)))
                      markDirty()
                    }}
                    className="w-1/3"
                  />
                  <Input
                    placeholder="Value (e.g. Stoneware)"
                    value={spec.value}
                    onChange={(e) => {
                      setSpecs((s) => s.map((r, j) => (j === i ? { ...r, value: e.target.value } : r)))
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
                      setSpecs((s) => s.filter((_, j) => j !== i))
                      markDirty()
                    }}
                  >
                    <Trash2 />
                  </Button>
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={() => setSpecs((s) => [...s, { label: '', value: '' }])}>
                <Plus /> Add specification
              </Button>
            </CardContent>
          </Card>

          {/* Shipping & policies */}
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
                <Textarea rows={2} placeholder="e.g. Returns accepted within 14 days…" {...register('returnPolicy')} />
              </FormField>
              <FormField label="Shipping info">
                <Textarea rows={2} placeholder="e.g. Ships within 2 business days…" {...register('shippingInfo')} />
              </FormField>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          {/* Pricing */}
          <Card>
            <CardHeader>
              <CardTitle>Pricing</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField label="Price (USD)" required error={errors.price?.message}>
                <Input type="number" step="0.01" min="0" placeholder="0.00" {...register('price', optionalNumber)} />
              </FormField>
              <FormField
                label="Compare-at price"
                error={errors.compareAtPrice?.message}
                hint="Shown struck-through to highlight a discount."
              >
                <Input type="number" step="0.01" min="0" placeholder="0.00" {...register('compareAtPrice', optionalNumber)} />
              </FormField>
              <FormField label="Currency">
                <Input value="USD" disabled />
              </FormField>
            </CardContent>
          </Card>

          {/* Inventory */}
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
                  <Input type="number" min="0" placeholder="0" {...register('stock', optionalNumber)} />
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

          {/* Flash sale */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Flash sale</CardTitle>
                <Switch
                  checked={flashSaleActive}
                  onCheckedChange={(c) => setValue('flashSaleActive', c === true, { shouldDirty: true })}
                  aria-label="Toggle flash sale"
                />
              </div>
              <CardDescription>Time-limited sale price shown with a countdown.</CardDescription>
            </CardHeader>
            {flashSaleActive && (
              <CardContent className="space-y-4">
                <FormField label="Sale price (USD)" required error={errors.flashSalePrice?.message}>
                  <Input type="number" step="0.01" min="0" placeholder="0.00" {...register('flashSalePrice', optionalNumber)} />
                </FormField>
                <FormField label="Ends at" required>
                  <Input type="datetime-local" {...register('flashSaleEndsAt')} />
                </FormField>
              </CardContent>
            )}
          </Card>

          {/* SEO */}
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
        </div>
      </div>
    </form>
  )
}
