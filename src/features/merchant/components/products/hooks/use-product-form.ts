import * as React from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import toast from 'react-hot-toast'
import { useNavigate, useParams } from 'react-router-dom'
import { getErrorMessage } from '@/lib/utils'
import { catalogService } from '@/services/catalog.service'
import { hasMaterialProductChanges, productsService } from '@/services/products.service'
import type { Product, ProductVariant } from '@/types'
import { localInputToMs, msToLocalInput, useMerchant } from '../../common'
import { productFormSchema, type ProductFormValues } from '../product-form.schema'
import type {
  ProductCatalogField,
  ProductOptionRow,
  ProductSpecification,
  ProductVariantRowState,
} from '../product-form.types'
import { buildProductVariantCombos, parseProductOptions, productVariantComboKey } from '../product-form.utils'

export function useProductForm() {
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
  const categoriesQ = useQuery({
    queryKey: ['catalog-top-categories'],
    queryFn: () => catalogService.listTopCategories(),
  })
  const brandsQ = useQuery({
    queryKey: ['catalog-brands'],
    queryFn: () => catalogService.listBrands(),
  })

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<ProductFormValues>({
    resolver: zodResolver(productFormSchema),
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
  const [optionRows, setOptionRows] = React.useState<ProductOptionRow[]>([])
  const [variantEdits, setVariantEdits] = React.useState<Record<string, ProductVariantRowState>>({})
  const [specs, setSpecs] = React.useState<ProductSpecification[]>([])
  const [extrasDirty, setExtrasDirty] = React.useState(false)
  const [hydrated, setHydrated] = React.useState(!isEdit)

  const markDirty = () => setExtrasDirty(true)

  React.useEffect(() => {
    const product = productQ.data
    if (!isEdit || !product) return
    reset({
      name: product.name,
      description: product.description,
      categoryId: product.categoryId,
      subcategoryId: product.subcategoryId ?? '',
      brandId: product.brandId ?? '',
      tags: product.tags.join(', '),
      price: product.price,
      compareAtPrice: product.compareAtPrice ?? undefined,
      sku: product.sku ?? '',
      barcode: product.barcode ?? '',
      stock: product.stock,
      lowStockThreshold: product.lowStockThreshold,
      minOrderQty: product.minOrderQty,
      maxOrderQty: product.maxOrderQty,
      weight: product.weight ?? '',
      dimensions: product.dimensions ?? '',
      warranty: product.warranty ?? '',
      returnPolicy: product.returnPolicy ?? '',
      shippingInfo: product.shippingInfo ?? '',
      seoTitle: product.seo?.title ?? '',
      seoDescription: product.seo?.description ?? '',
      flashSaleActive: product.flashSale?.active ?? false,
      flashSalePrice: product.flashSale?.salePrice,
      flashSaleEndsAt: product.flashSale?.endsAt ? msToLocalInput(product.flashSale.endsAt) : '',
    })
    setImages(product.images)
    setSpecs(product.specifications ?? [])
    setOptionRows(
      Object.entries(product.variantOptions ?? {}).map(([name, values]) => ({
        name,
        values: values.join(', '),
      })),
    )
    const edits: Record<string, ProductVariantRowState> = {}
    for (const variant of product.variants ?? []) {
      edits[productVariantComboKey(variant.options)] = {
        price: variant.price != null ? String(variant.price) : '',
        stock: String(variant.stock),
        sku: variant.sku ?? '',
      }
    }
    setVariantEdits(edits)
    setExtrasDirty(false)
    setHydrated(true)
  }, [isEdit, productQ.data, reset])

  const dirty = isDirty || extrasDirty
  React.useEffect(() => {
    if (!dirty) return
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault()
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirty])

  const variantOptions = React.useMemo(() => parseProductOptions(optionRows), [optionRows])
  const combos = React.useMemo(() => buildProductVariantCombos(variantOptions), [variantOptions])

  const buildVariants = (baseStock: number): ProductVariant[] =>
    combos.map((combo) => {
      const key = productVariantComboKey(combo)
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

  const save = async (values: ProductFormValues, submitForReview: boolean) => {
    if (images.length === 0) {
      toast.error('Add at least one product image.')
      return
    }
    const variants = buildVariants(values.stock)
    const specifications = specs.filter((spec) => spec.label.trim() && spec.value.trim())
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
        .map((tag) => tag.trim())
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
        const requiresReapproval =
          productQ.data.status === 'approved' && hasMaterialProductChanges(productQ.data, payload)
        const status = submitForReview || requiresReapproval ? 'pending' : productQ.data.status
        await productsService.update(productQ.data.id, {
          ...payload,
          status,
          ...((submitForReview || requiresReapproval)
            ? { publiclyVisible: false, rejectionReason: '' }
            : {}),
        } as Partial<Product>)
        toast.success(
          requiresReapproval
            ? 'Material changes saved and sent for reapproval'
            : submitForReview
              ? 'Product updated & submitted for review'
              : 'Product updated',
        )
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
      reset(values)
      await queryClient.invalidateQueries({ queryKey: ['merchant-products', store.id] })
      await queryClient.invalidateQueries({ queryKey: ['merchant-product', productId] })
      navigate('/merchant/products')
    } catch (error) {
      toast.error(getErrorMessage(error))
    }
  }

  const status = productQ.data?.status
  const canSubmitForReview = !isEdit || status === 'draft' || status === 'rejected'

  const selectField = (field: ProductCatalogField) => (value: string) => {
    setValue(field, value, { shouldDirty: true, shouldValidate: true })
    if (field === 'categoryId') setValue('subcategoryId', '', { shouldDirty: true })
  }

  const changeImages = (urls: string[]) => {
    setImages(urls)
    markDirty()
  }

  return {
    store,
    productId,
    product: productQ.data,
    isEdit,
    isProductLoading: productQ.isLoading,
    hydrated,
    status,
    canSubmitForReview,
    register,
    handleSubmit,
    watch,
    setValue,
    errors,
    isSubmitting,
    categoryId,
    flashSaleActive,
    categories: categoriesQ.data ?? [],
    subcategories: subcategoriesQ.data ?? [],
    brands: brandsQ.data ?? [],
    images,
    changeImages,
    optionRows,
    setOptionRows,
    variantEdits,
    setVariantEdits,
    combos,
    specs,
    setSpecs,
    markDirty,
    selectField,
    save,
    navigateToProducts: () => navigate('/merchant/products'),
  }
}
