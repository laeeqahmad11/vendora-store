export interface ProductOptionRow {
  name: string
  values: string
}

export interface ProductVariantRowState {
  price: string
  stock: string
  sku: string
}

export interface ProductSpecification {
  label: string
  value: string
}

export type ProductCatalogField = 'categoryId' | 'subcategoryId' | 'brandId'
