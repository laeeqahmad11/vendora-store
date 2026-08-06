import type { Product } from '@/types'
import { productsService } from '@/services/products.service'
import { parseCsv } from '../common'
import { PRODUCT_CSV_REQUIRED_COLUMNS } from './products.constants'

type ProductCreateInput = Parameters<typeof productsService.create>[0]

export function getProductCsvDrafts(text: string, storeId: string, merchantId: string): ProductCreateInput[] {
  const rows = parseCsv(text)

  if (rows.length < 2) {
    throw new Error('CSV must contain a header row and at least one data row.')
  }

  const header = rows[0].map((value) => value.trim().toLowerCase())
  const indexOf = (name: string) => header.indexOf(name)

  for (const column of PRODUCT_CSV_REQUIRED_COLUMNS) {
    if (indexOf(column) === -1) {
      throw new Error(`Missing required column "${column}".`)
    }
  }

  const drafts: ProductCreateInput[] = []

  for (const row of rows.slice(1)) {
    const name = row[indexOf('name')]?.trim()

    if (!name) continue

    const price = Number(row[indexOf('price')] ?? 0)
    const stock = indexOf('stock') >= 0 ? Number(row[indexOf('stock')] ?? 0) : 0

    drafts.push({
      storeId,
      merchantId,
      name,
      description: indexOf('description') >= 0 ? (row[indexOf('description')] ?? '') : '',
      images: [],
      price: Number.isFinite(price) ? price : 0,
      currency: 'USD',
      stock: Number.isFinite(stock) ? Math.round(stock) : 0,
      categoryId: indexOf('categoryid') >= 0 ? (row[indexOf('categoryid')] ?? '').trim() : '',
      tags: [],
      status: 'draft',
    })
  }

  return drafts
}

export function getProductCsvExportRows(products: Product[]) {
  return products.map((product) => [
    product.name,
    product.description,
    product.price,
    product.stock,
    product.categoryId,
    product.sku ?? '',
    product.status,
    product.soldCount,
  ])
}
