import { execFile } from 'node:child_process'
import path from 'node:path'
import { promisify } from 'node:util'
import type { Locator, Page } from '@playwright/test'
import { expect } from '../../fixtures'

const execFileAsync = promisify(execFile)

export const product = {
  name: 'E2E VoltEdge 20W USB-C Charger',
  description:
    'Deterministic Playwright merchant product used only in Firebase Emulator E2E tests.',
  price: '2900',
  formattedPrice: '$2,900.00',
  reapprovedPrice: '3100',
  reapprovedFormattedPrice: '$3,100.00',
  compareAtPrice: '3499',
  sku: 'E2E-CHG-001',
  stock: '25',
  updatedStock: '27',
  inventoryOnlyStock: '28',
  lowStockThreshold: '5',
  minOrderQty: '1',
  maxOrderQty: '10',
  category: 'E2E Electronics',
  subcategory: 'E2E Chargers',
  brand: 'E2E VoltEdge',
} as const

export function summaryCard(page: Page, title: string, count: number) {
  return page.getByRole('button', { name: new RegExp(`^${title}\\s+${count}\\b`) })
}

export function productTab(page: Page, title: string, count: number) {
  return page.getByRole('tab', { name: new RegExp(`^${title}\\s+${count}$`) })
}

export function productRow(page: Page): Locator {
  return page.getByRole('row').filter({ hasText: product.name })
}

async function selectCatalogOption(page: Page, index: number, option: string) {
  await page.getByRole('combobox').nth(index).click()
  await page.getByRole('option', { name: option, exact: true }).click()
}

export async function resetSeededEmulatorData() {
  await execFileAsync(process.execPath, [
    path.resolve('scripts/e2e/seed-emulators.mjs'),
    '--preserve-auth',
  ])
}

export async function assertEmptySeededCatalog(page: Page) {
  await expect(page.getByRole('heading', { name: 'Products', exact: true })).toBeVisible({
    timeout: 30_000,
  })
  await expect(page.getByRole('heading', { name: 'No products yet', exact: true })).toBeVisible()
  await expect(summaryCard(page, 'Total products', 0)).toBeVisible()
  await expect(summaryCard(page, 'Approved', 0)).toBeVisible()
  await expect(summaryCard(page, 'Pending review', 0)).toBeVisible()
  await expect(productTab(page, 'All', 0)).toBeVisible()
  await expect(productTab(page, 'Drafts', 0)).toBeVisible()
  await expect(productTab(page, 'Pending', 0)).toBeVisible()
  await expect(productTab(page, 'Approved', 0)).toBeVisible()
  await expect(productTab(page, 'Rejected', 0)).toBeVisible()
  await expect(productTab(page, 'Archived', 0)).toBeVisible()
}

export async function assertProductRow(page: Page, stock: string, status: string) {
  const row = productRow(page)
  await expect(row).toBeVisible()
  await expect(row.getByRole('link', { name: product.name, exact: true })).toBeVisible()
  await expect(row.getByText(`SKU ${product.sku}`, { exact: true })).toBeVisible()
  await expect(row.getByText(stock, { exact: true })).toBeVisible()
  await expect(row.getByText(status, { exact: true })).toBeVisible()
}

export async function completeMerchantProductLifecycle(page: Page) {
  await page.goto('/merchant/products')
  await expect(page).toHaveURL('/merchant/products')
  await assertEmptySeededCatalog(page)

  await page.getByRole('link', { name: 'Add product', exact: true }).first().click()
  await expect(page).toHaveURL('/merchant/products/new')
  await expect(page.getByRole('heading', { name: 'New product', exact: true })).toBeVisible()

  await page.getByPlaceholder('e.g. Handmade ceramic mug').fill(product.name)
  await page.getByPlaceholder(/Describe materials/).fill(product.description)
  await selectCatalogOption(page, 0, product.category)
  await selectCatalogOption(page, 1, product.subcategory)
  await selectCatalogOption(page, 2, product.brand)

  await page.getByPlaceholder('0.00').nth(0).fill(product.price)
  await page.getByPlaceholder('0.00').nth(1).fill(product.compareAtPrice)
  await page.getByPlaceholder('SKU-001').fill(product.sku)
  await page.getByPlaceholder('0', { exact: true }).fill(product.stock)
  await page.getByPlaceholder('5', { exact: true }).fill(product.lowStockThreshold)
  await page.getByPlaceholder('1', { exact: true }).fill(product.minOrderQty)
  await page.getByPlaceholder('10', { exact: true }).fill(product.maxOrderQty)

  await page
    .locator('input[type="file"]')
    .setInputFiles(path.resolve('tests/fixtures/assets/product.png'))
  await expect(page.getByRole('img', { name: 'Upload 1', exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'Save as draft', exact: true }).click()
  await expect(page).toHaveURL('/merchant/products')
  await assertProductRow(page, product.stock, 'Draft')
  await expect(summaryCard(page, 'Total products', 1)).toBeVisible()
  await expect(summaryCard(page, 'Pending review', 0)).toBeVisible()
  await expect(productTab(page, 'All', 1)).toBeVisible()
  await expect(productTab(page, 'Drafts', 1)).toBeVisible()
  await expect(page.getByText('Showing 1 of 1 product', { exact: true })).toBeVisible()

  await productRow(page).getByRole('link', { name: product.name, exact: true }).click()
  await expect(page).toHaveURL(/\/merchant\/products\/[^/]+\/edit$/)
  await expect(page.getByRole('heading', { name: 'Edit product', exact: true })).toBeVisible()
  await expect(page.getByPlaceholder('0', { exact: true })).toHaveValue(product.stock)
  await page.getByPlaceholder('0', { exact: true }).fill(product.updatedStock)
  await page.getByRole('button', { name: 'Save changes', exact: true }).click()

  await expect(page).toHaveURL('/merchant/products')
  await assertProductRow(page, product.updatedStock, 'Draft')

  await productRow(page).getByRole('link', { name: product.name, exact: true }).click()
  await expect(page.getByPlaceholder('0', { exact: true })).toHaveValue(product.updatedStock)
  await page.getByRole('button', { name: 'Save & submit for review', exact: true }).click()

  await expect(page).toHaveURL('/merchant/products')
  await assertProductRow(page, product.updatedStock, 'Pending Review')
  await expect(summaryCard(page, 'Total products', 1)).toBeVisible()
  await expect(summaryCard(page, 'Pending review', 1)).toBeVisible()
  await expect(productTab(page, 'All', 1)).toBeVisible()
  await expect(productTab(page, 'Drafts', 0)).toBeVisible()
  await expect(productTab(page, 'Pending', 1)).toBeVisible()
}
