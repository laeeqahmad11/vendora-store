import { execFile } from 'node:child_process'
import path from 'node:path'
import { promisify } from 'node:util'
import type { Browser, BrowserContext, Page } from '@playwright/test'
import { expect, installNetworkPolicy, test } from '../fixtures'

const execFileAsync = promisify(execFile)
const authState = (role: 'merchant' | 'admin') => path.resolve('tests', '.auth', `${role}.json`)
const product = {
  name: 'E2E Authoritative Variant Hoodie',
  description: 'A deterministic emulator-only hoodie with independently authoritative color inventory.',
  price: '2400',
  formattedPrice: '$2,400.00',
  option: 'Color',
  values: 'Red, Blue, Sold Out',
  redStock: '1',
  blueStock: '2',
  soldOutStock: '0',
} as const

async function resetSeededEmulatorData() {
  await execFileAsync(process.execPath, [
    path.resolve('scripts/e2e/seed-emulators.mjs'),
    '--preserve-auth',
  ])
}

async function newSafePage(browser: Browser, baseURL: string, storageState: string) {
  const context = await browser.newContext({ baseURL, serviceWorkers: 'block', storageState })
  const page = await context.newPage()
  await installNetworkPolicy(page, baseURL, true)
  return { context, page }
}

async function selectCatalogOption(page: Page, index: number, option: string) {
  await page.getByRole('combobox').nth(index).click()
  await page.getByRole('option', { name: option, exact: true }).click()
}

async function createVariantProduct(page: Page) {
  await page.goto('/merchant/products/new')
  await page.getByPlaceholder('e.g. Handmade ceramic mug').fill(product.name)
  await page.getByPlaceholder(/Describe materials/).fill(product.description)
  await selectCatalogOption(page, 0, 'E2E Electronics')
  await selectCatalogOption(page, 1, 'E2E Chargers')
  await selectCatalogOption(page, 2, 'E2E VoltEdge')
  await page.getByPlaceholder('0.00').nth(0).fill(product.price)
  await page.getByPlaceholder('SKU-001').fill('E2E-VAR-HOODIE')
  await page.getByPlaceholder('5', { exact: true }).fill('1')
  await page.getByPlaceholder('1', { exact: true }).fill('1')
  await page.getByPlaceholder('10', { exact: true }).fill('5')

  await page.getByRole('button', { name: 'Add option', exact: true }).click()
  await page.getByPlaceholder('Color', { exact: true }).fill(product.option)
  await page.getByPlaceholder('Red, Blue, Green', { exact: true }).fill(product.values)

  const redRow = page.getByRole('row').filter({ hasText: /^Red/ })
  const blueRow = page.getByRole('row').filter({ hasText: /^Blue/ })
  const soldOutRow = page.getByRole('row').filter({ hasText: /^Sold Out/ })
  await redRow.getByPlaceholder('0', { exact: true }).fill(product.redStock)
  await blueRow.getByPlaceholder('0', { exact: true }).fill(product.blueStock)
  await soldOutRow.getByPlaceholder('0', { exact: true }).fill(product.soldOutStock)
  await redRow.getByPlaceholder('SKU', { exact: true }).fill('E2E-VAR-RED')
  await blueRow.getByPlaceholder('SKU', { exact: true }).fill('E2E-VAR-BLUE')
  await soldOutRow.getByPlaceholder('SKU', { exact: true }).fill('E2E-VAR-OUT')
  await expect(page.getByLabel('Total variant stock')).toHaveValue('3')

  await page.locator('input[type="file"]').setInputFiles(path.resolve('tests/fixtures/assets/product.png'))
  await expect(page.getByRole('img', { name: 'Upload 1', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Save & submit for review', exact: true }).click()
  await expect(page).toHaveURL('/merchant/products')
  await expect(page.getByRole('row').filter({ hasText: product.name }).getByText('3', { exact: true })).toBeVisible()
}

async function approveProduct(page: Page) {
  await page.goto('/admin/products')
  const row = page.getByRole('row').filter({ hasText: product.name })
  await expect(row).toBeVisible()
  await row.getByRole('button', { name: 'Review', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: 'Approve', exact: true }).click()
  await expect(page.getByText('Product approved', { exact: true })).toBeVisible()
}

async function openPublicProduct(page: Page) {
  await page.goto('/stores/e2e-approved-store')
  const link = page.getByRole('link').filter({ hasText: product.name }).first()
  await expect(link).toBeVisible()
  await link.click()
  await expect(page.getByRole('heading', { name: product.name, exact: true })).toBeVisible()
}

async function placeOrder(page: Page) {
  await page.getByRole('button', { name: 'Red', exact: true }).click()
  await expect(page.getByText('Only 1 left', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Add to cart', exact: true }).click()
  await page.getByRole('link', { name: 'Cart with 1 items', exact: true }).filter({ visible: true }).click()
  await page.getByRole('button', { name: 'Proceed to checkout', exact: true }).click()
  await page.getByPlaceholder('Street address', { exact: true }).fill('27 Emulator Avenue')
  await page.locator('input[autocomplete="address-level2"]').fill('Lahore')
  await page.locator('input[autocomplete="address-level1"]').fill('Punjab')
  await page.locator('input[autocomplete="postal-code"]').fill('54000')
  await page.locator('input[autocomplete="country-name"]').fill('Pakistan')
  await page.getByRole('button', { name: 'Place order', exact: true }).click()
  await expect(page).toHaveURL('/order-success')
  await page.getByRole('link', { name: 'Track order', exact: true }).click()
  await expect(page.getByText('Color: Red', { exact: true })).toBeVisible()
}

async function assertInventory(page: Page, total: string, red: string, blue: string) {
  await page.goto('/merchant/inventory')
  const row = page.getByRole('row').filter({ hasText: product.name })
  await expect(row).toBeVisible()
  await expect(row.getByText(total, { exact: true }).first()).toBeVisible()
  const redLine = row.getByText('Red', { exact: true }).locator('..')
  const blueLine = row.getByText('Blue', { exact: true }).locator('..')
  await expect(redLine.getByText(red, { exact: true })).toBeVisible()
  await expect(blueLine.getByText(blue, { exact: true })).toBeVisible()
}

test.beforeEach(resetSeededEmulatorData)

test('variant inventory stays authoritative from product form through checkout and cancellation', async ({
  baseURL,
  browser,
  page: customerPage,
}) => {
  test.setTimeout(210_000)
  const appURL = baseURL ?? 'http://127.0.0.1:5173'
  const contexts: BrowserContext[] = []
  try {
    const merchant = await newSafePage(browser, appURL, authState('merchant'))
    const admin = await newSafePage(browser, appURL, authState('admin'))
    contexts.push(merchant.context, admin.context)

    await createVariantProduct(merchant.page)
    await approveProduct(admin.page)
    await openPublicProduct(customerPage)

    await customerPage.getByRole('button', { name: 'Sold Out', exact: true }).click()
    await expect(customerPage.getByText('Out of stock', { exact: true })).toBeVisible()
    await expect(customerPage.getByRole('button', { name: 'Add to cart', exact: true })).toBeDisabled()

    await placeOrder(customerPage)
    await assertInventory(merchant.page, '2', '0', '2')

    await customerPage.getByRole('button', { name: 'Cancel order', exact: true }).click()
    const dialog = customerPage.getByRole('dialog')
    await dialog.getByRole('button', { name: 'Cancel order', exact: true }).click()
    await expect(customerPage.getByText('Order cancelled', { exact: true })).toBeVisible()
    await assertInventory(merchant.page, '3', '1', '2')

    await openPublicProduct(customerPage)
    await customerPage.getByRole('button', { name: 'Red', exact: true }).click()
    await expect(customerPage.getByText('Only 1 left', { exact: true })).toBeVisible()
    await expect(customerPage.getByText(product.formattedPrice, { exact: true }).first()).toBeVisible()

    // Variant stock is operational and goes through the trusted inventory
    // callable without reopening moderation.
    await merchant.page.goto('/merchant/products')
    let merchantRow = merchant.page.getByRole('row').filter({ hasText: product.name })
    await merchantRow.getByRole('link', { name: product.name, exact: true }).click()
    let redRow = merchant.page.getByRole('row').filter({ hasText: /^Red/ })
    await redRow.getByPlaceholder('0', { exact: true }).fill('2')
    await expect(merchant.page.getByLabel('Total variant stock')).toHaveValue('4')
    await merchant.page.getByRole('button', { name: 'Save changes', exact: true }).click()
    await expect(merchant.page.getByText('Product updated', { exact: true })).toBeVisible()
    merchantRow = merchant.page.getByRole('row').filter({ hasText: product.name })
    await expect(merchantRow.getByText('Approved', { exact: true })).toBeVisible()
    await expect(merchantRow.getByText('4', { exact: true })).toBeVisible()
    await admin.page.goto('/admin/products')
    await expect(admin.page.getByRole('heading', { name: 'Queue is clear', exact: true })).toBeVisible()

    // Variant price remains material and must atomically leave public approval.
    await merchantRow.getByRole('link', { name: product.name, exact: true }).click()
    redRow = merchant.page.getByRole('row').filter({ hasText: /^Red/ })
    await redRow.getByPlaceholder('Base price', { exact: true }).fill('2500')
    await merchant.page.getByRole('button', { name: 'Save changes', exact: true }).click()
    await expect(
      merchant.page.getByText('Material changes saved and sent for reapproval', { exact: true }),
    ).toBeVisible()
    merchantRow = merchant.page.getByRole('row').filter({ hasText: product.name })
    await expect(merchantRow.getByText('Pending Review', { exact: true })).toBeVisible()
    await admin.page.goto('/admin/products')
    await expect(admin.page.getByRole('row').filter({ hasText: product.name })).toBeVisible()
  } finally {
    await Promise.all(contexts.map((context) => context.close()))
  }
})
