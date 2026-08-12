export interface ProductOptionRow {
  name: string
  values: string
}

export interface ProductVariantRowState {
  id?: string
  price: string
  stock: string
  sku: string
}

export interface ProductSpecification {
  label: string
  value: string
}

export type ProductCatalogField = 'categoryId' | 'subcategoryId' | 'brandId'
