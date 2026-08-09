import { execFile } from 'node:child_process'
import path from 'node:path'
import { promisify } from 'node:util'
import type { Locator, Page } from '@playwright/test'
import { expect, test } from '../fixtures'

const execFileAsync = promisify(execFile)

const product = {
  name: 'E2E Inventory Control Product',
  sku: 'E2E-INV-027',
  initialStock: 27,
  sold: 0,
  lowStockThreshold: 5,
} as const

const notes = {
  addition: 'E2E manual stock addition',
  removal: 'E2E manual stock removal',
  lowStock: 'E2E transition to low stock',
  outOfStock: 'E2E transition to out of stock',
  restoration: 'E2E restore stock',
} as const

async function resetAndSeedInventoryProduct() {
  await execFileAsync(process.execPath, [
    path.resolve('scripts/e2e/seed-emulators.mjs'),
    '--preserve-auth',
    '--inventory-product',
  ])
}

function inventoryRow(page: Page): Locator {
  return page.getByRole('row').filter({ hasText: product.name })
}

function summaryCard(page: Page, title: string, count: number): Locator {
  return page.getByRole('button', { name: new RegExp(`^${title}\\s+${count}$`) })
}

function stockTab(page: Page, title: string, count: number): Locator {
  return page.getByRole('tab', { name: new RegExp(`^${title} \\(${count}\\)$`) })
}

function inventoryLog(page: Page, note: string): Locator {
  return page
    .getByText(note, { exact: true })
    .locator('xpath=ancestor::div[contains(@class, "rounded-xl")][1]')
}

async function assertInventoryRow(page: Page, stock: number, status: string) {
  const row = inventoryRow(page)
  const cells = row.getByRole('cell')
  await expect(row).toBeVisible({ timeout: 30_000 })
  await expect(cells.nth(0).getByText(product.name, { exact: true })).toBeVisible()
  await expect(cells.nth(1).getByText(product.sku, { exact: true })).toBeVisible()
  await expect(cells.nth(2).getByText(String(stock), { exact: true })).toBeVisible()
  await expect(cells.nth(3).getByText(status, { exact: true })).toBeVisible()
  await expect(cells.nth(4)).toHaveText(String(product.lowStockThreshold))
  await expect(cells.nth(5)).toHaveText(String(product.sold))
}

async function assertSummary(
  page: Page,
  availableUnits: number,
  lowStockCount: number,
  outOfStockCount: number,
) {
  await expect(summaryCard(page, 'Products', 1)).toBeVisible()
  await expect(page.getByText('Available units', { exact: true }).locator('..')).toContainText(
    String(availableUnits),
  )
  await expect(summaryCard(page, 'Low stock', lowStockCount)).toBeVisible()
  await expect(summaryCard(page, 'Out of stock', outOfStockCount)).toBeVisible()
  await expect(stockTab(page, 'All', 1)).toBeVisible()
  await expect(stockTab(page, 'Low stock', lowStockCount)).toBeVisible()
  await expect(stockTab(page, 'Out of stock', outOfStockCount)).toBeVisible()
}

async function adjustStock(
  page: Page,
  direction: 'add' | 'remove',
  quantity: number,
  reason: 'Restock' | 'Adjustment / correction' | 'Customer return',
  note: string,
) {
  await inventoryRow(page).getByRole('button', { name: 'Adjust stock', exact: true }).click()

  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('heading', { name: 'Adjust stock', exact: true })).toBeVisible()
  await dialog
    .getByRole('button', { name: direction === 'add' ? 'Add stock' : 'Remove stock', exact: true })
    .click()
  await dialog.locator('input[type="number"]').fill(String(quantity))
  await dialog.getByRole('combobox').click()
  await page.getByRole('option', { name: reason, exact: true }).click()
  await dialog.getByPlaceholder(/Optional note/).fill(note)
  await dialog.getByRole('button', { name: 'Apply adjustment', exact: true }).click()

  await expect(page.getByText('Stock updated', { exact: true })).toBeVisible()
  await expect(dialog).toBeHidden()
}

async function assertLog(
  page: Page,
  note: string,
  reason: 'Restock' | 'Adjustment' | 'Customer return',
  change: string,
) {
  await expect(page.getByText(note, { exact: true })).toHaveCount(1)
  const log = inventoryLog(page, note)
  await expect(log).toBeVisible()
  await expect(log).toContainText(product.name)
  await expect(log).toContainText(reason)
  await expect(log).toContainText('By merchant')
  await expect(log).toContainText(change)
  await expect(log).toContainText(/(seconds?|minute) ago/)
}

test.beforeEach(resetAndSeedInventoryProduct)

test('merchant manages inventory stock, statuses, history, and product consistency', async ({ page }) => {
  test.setTimeout(180_000)

  await page.goto('/merchant/inventory')
  await expect(page).toHaveURL('/merchant/inventory')
  await expect(page.getByRole('heading', { name: 'Inventory', exact: true })).toBeVisible()
  await assertInventoryRow(page, product.initialStock, 'In stock')
  await assertSummary(page, product.initialStock, 0, 0)
  await expect(page.getByText('No stock movements yet', { exact: true })).toBeVisible()

  await page.reload()
  await assertInventoryRow(page, product.initialStock, 'In stock')
  await assertSummary(page, product.initialStock, 0, 0)

  await adjustStock(page, 'add', 5, 'Restock', notes.addition)
  await assertInventoryRow(page, 32, 'In stock')
  await assertSummary(page, 32, 0, 0)
  await assertLog(page, notes.addition, 'Restock', '+5')

  await page.reload()
  await assertInventoryRow(page, 32, 'In stock')
  await assertLog(page, notes.addition, 'Restock', '+5')

  await adjustStock(page, 'remove', 4, 'Adjustment / correction', notes.removal)
  await assertInventoryRow(page, 28, 'In stock')
  await assertSummary(page, 28, 0, 0)
  await assertLog(page, notes.addition, 'Restock', '+5')
  await assertLog(page, notes.removal, 'Adjustment', '-4')

  await page.reload()
  await assertInventoryRow(page, 28, 'In stock')
  await assertLog(page, notes.addition, 'Restock', '+5')
  await assertLog(page, notes.removal, 'Adjustment', '-4')

  await adjustStock(page, 'remove', 23, 'Adjustment / correction', notes.lowStock)
  await assertInventoryRow(page, 5, 'Low stock')
  await assertSummary(page, 5, 1, 0)
  await stockTab(page, 'Low stock', 1).click()
  await assertInventoryRow(page, 5, 'Low stock')
  await stockTab(page, 'Out of stock', 0).click()
  await expect(inventoryRow(page)).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Nothing out of stock', exact: true })).toBeVisible()
  await stockTab(page, 'All', 1).click()

  await adjustStock(page, 'remove', 5, 'Adjustment / correction', notes.outOfStock)
  await assertInventoryRow(page, 0, 'Out of stock')
  await assertSummary(page, 0, 0, 1)
  await stockTab(page, 'Out of stock', 1).click()
  await assertInventoryRow(page, 0, 'Out of stock')
  await stockTab(page, 'Low stock', 0).click()
  await expect(inventoryRow(page)).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'No low-stock products', exact: true })).toBeVisible()
  await stockTab(page, 'All', 1).click()

  await page.reload()
  await assertInventoryRow(page, 0, 'Out of stock')
  await assertSummary(page, 0, 0, 1)
  await assertLog(page, notes.addition, 'Restock', '+5')
  await assertLog(page, notes.removal, 'Adjustment', '-4')
  await assertLog(page, notes.lowStock, 'Adjustment', '-23')
  await assertLog(page, notes.outOfStock, 'Adjustment', '-5')

  await inventoryRow(page).getByRole('button', { name: 'Adjust stock', exact: true }).click()
  const invalidDialog = page.getByRole('dialog')
  await invalidDialog.getByRole('button', { name: 'Remove stock', exact: true }).click()
  await invalidDialog.locator('input[type="number"]').fill('1')
  await invalidDialog.getByRole('button', { name: 'Apply adjustment', exact: true }).click()
  await expect(page.getByText('Stock cannot go below zero.', { exact: true })).toBeVisible()
  await expect(invalidDialog).toBeVisible()
  await expect(page.getByText('By merchant', { exact: true })).toHaveCount(4)
  await invalidDialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(invalidDialog).toBeHidden()
  await assertInventoryRow(page, 0, 'Out of stock')
  await expect(page.getByText('By merchant', { exact: true })).toHaveCount(4)

  await adjustStock(page, 'add', product.initialStock, 'Restock', notes.restoration)
  await assertInventoryRow(page, product.initialStock, 'In stock')
  await assertSummary(page, product.initialStock, 0, 0)

  const expectedLogs = [
    [notes.addition, 'Restock', '+5'],
    [notes.removal, 'Adjustment', '-4'],
    [notes.lowStock, 'Adjustment', '-23'],
    [notes.outOfStock, 'Adjustment', '-5'],
    [notes.restoration, 'Restock', '+27'],
  ] as const

  for (const [note, reason, change] of expectedLogs) {
    await assertLog(page, note, reason, change)
  }

  await page.reload()
  await assertInventoryRow(page, product.initialStock, 'In stock')
  await assertSummary(page, product.initialStock, 0, 0)
  for (const [note, reason, change] of expectedLogs) {
    await assertLog(page, note, reason, change)
  }

  await page.goto('/merchant/products')
  await expect(page.getByRole('heading', { name: 'Products', exact: true })).toBeVisible()
  const productRow = page.getByRole('row').filter({ hasText: product.name })
  const productCells = productRow.getByRole('cell')
  await expect(productRow).toBeVisible()
  await expect(productCells.nth(1)).toContainText(`SKU ${product.sku}`)
  await expect(productCells.nth(3)).toHaveText(String(product.initialStock))
  await expect(productCells.nth(4).getByText('Approved', { exact: true })).toBeVisible()
  await expect(productCells.nth(5)).toHaveText(String(product.sold))

  await page.goto('/merchant/inventory')
  await assertInventoryRow(page, product.initialStock, 'In stock')
  await assertSummary(page, product.initialStock, 0, 0)

  console.info(
    'MERCHANT_INVENTORY_E2E product=e2e-inventory-product stock=27->32->28->5->0->27 ' +
      'sold=0->0 manualLogs=5 rejectedLogs=0 statuses=in-stock->low-stock->out-of-stock->in-stock',
  )
})
