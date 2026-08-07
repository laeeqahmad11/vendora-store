import { z } from 'zod'

export const productFormSchema = z.object({
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

export type ProductFormValues = z.infer<typeof productFormSchema>

export const optionalNumber = {
  setValueAs: (value: unknown) => (value === '' || value == null ? undefined : Number(value)),
}
