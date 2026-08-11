import path from 'node:path'
import type { Browser, Page } from '@playwright/test'
import { expect, installNetworkPolicy, test } from '../fixtures'
import {
  assertProductRow,
  completeMerchantProductLifecycle,
  product,
  productRow,
  productTab,
  resetSeededEmulatorData,
  summaryCard,
} from './support/merchant-product-lifecycle'

const authState = (role: 'admin') => path.resolve('tests', '.auth', `${role}.json`)

async function newSafePage(browser: Browser, baseURL: string, storageState?: string) {
  const context = await browser.newContext({
    baseURL,
    serviceWorkers: 'block',
    storageState: storageState ?? { cookies: [], origins: [] },
  })
  const page = await context.newPage()
  await installNetworkPolicy(page, baseURL, true)
  return page
}

function adminProductRow(page: Page) {
  return page.getByRole('row').filter({ hasText: product.name })
}

test.beforeEach(resetSeededEmulatorData)

test('admin approval publishes a merchant product to the public store', async ({
  baseURL,
  browser,
  page: merchantPage,
}) => {
  test.setTimeout(150_000)
  const appURL = baseURL ?? 'http://127.0.0.1:5173'

  await completeMerchantProductLifecycle(merchantPage)

  const adminPage = await newSafePage(browser, appURL, authState('admin'))
  await adminPage.goto('/admin/products')
  await expect(adminPage).toHaveURL('/admin/products')
  await expect(adminPage.getByRole('heading', { name: 'Products', exact: true })).toBeVisible()
  await expect(adminPage.getByRole('tab', { name: /Approval queue\s+1/ })).toBeVisible()

  const pendingRow = adminProductRow(adminPage)
  await expect(pendingRow).toBeVisible()
  await expect(pendingRow.getByText('E2E Approved Store', { exact: true })).toBeVisible()
  await expect(pendingRow.getByText(product.formattedPrice, { exact: true })).toBeVisible()
  await pendingRow.getByRole('button', { name: 'Review', exact: true }).click()

  const reviewDialog = adminPage.getByRole('dialog')
  await expect(reviewDialog.getByRole('heading', { name: product.name, exact: true })).toBeVisible()
  await expect(reviewDialog.getByText(product.description, { exact: true })).toBeVisible()
  await reviewDialog.getByRole('button', { name: 'Approve', exact: true }).click()

  await expect(adminPage.getByText('Product approved', { exact: true })).toBeVisible()
  await expect(reviewDialog).toBeHidden()
  await expect(adminProductRow(adminPage)).toHaveCount(0)
  await expect(adminPage.getByRole('heading', { name: 'Queue is clear', exact: true })).toBeVisible()

  await adminPage.getByRole('tab', { name: 'All products', exact: true }).click()
  await expect(adminProductRow(adminPage)).toBeVisible()

  await merchantPage.goto('/merchant/products')
  await expect(merchantPage).toHaveURL('/merchant/products')
  await assertProductRow(merchantPage, product.updatedStock, 'Approved')
  await expect(summaryCard(merchantPage, 'Approved', 1)).toBeVisible()
  await expect(productTab(merchantPage, 'Approved', 1)).toBeVisible()
  await expect(productTab(merchantPage, 'Pending', 0)).toBeVisible()

  const publicPage = await newSafePage(browser, appURL)
  await publicPage.goto('/stores/e2e-approved-store')
  await expect(publicPage).toHaveURL('/stores/e2e-approved-store')
  await expect(publicPage.getByRole('link', { name: 'Sign in', exact: true })).toBeVisible()
  await expect(
    publicPage.getByRole('heading', { name: /^E2E Approved Store/ }),
  ).toBeVisible()

  const publicProduct = publicPage.getByRole('link').filter({ hasText: product.name }).first()
  await expect(publicProduct).toBeVisible()
  await expect(publicProduct.getByText(product.formattedPrice, { exact: true })).toBeVisible()
  await publicProduct.click()

  await expect(publicPage).toHaveURL(/\/products\/[^/]+$/)
  await expect(publicPage.getByRole('heading', { name: product.name, exact: true })).toBeVisible()
  await expect(publicPage.getByText(product.formattedPrice, { exact: true }).first()).toBeVisible()

  // A material merchant edit atomically leaves approval and public visibility.
  await merchantPage.goto('/merchant/products')
  await productRow(merchantPage).getByRole('link', { name: product.name, exact: true }).click()
  await merchantPage.getByPlaceholder('0.00').nth(0).fill(product.reapprovedPrice)
  await merchantPage.getByRole('button', { name: 'Save changes', exact: true }).click()
  await expect(
    merchantPage.getByText('Material changes saved and sent for reapproval', { exact: true }),
  ).toBeVisible()
  await assertProductRow(merchantPage, product.updatedStock, 'Pending Review')
  await expect(productRow(merchantPage).getByText(product.reapprovedFormattedPrice, { exact: true })).toBeVisible()

  await publicPage.goto('/stores/e2e-approved-store')
  await expect(publicPage.getByRole('link').filter({ hasText: product.name })).toHaveCount(0)

  // The changed version returns to the existing queue and is public only after
  // a second administrator approval.
  await adminPage.goto('/admin/products')
  await expect(adminPage.getByRole('tab', { name: /Approval queue\s+1/ })).toBeVisible()
  const rereviewRow = adminProductRow(adminPage)
  await expect(rereviewRow.getByText(product.reapprovedFormattedPrice, { exact: true })).toBeVisible()
  await rereviewRow.getByRole('button', { name: 'Review', exact: true }).click()
  const rereviewDialog = adminPage.getByRole('dialog')
  await rereviewDialog.getByRole('button', { name: 'Approve', exact: true }).click()
  await expect(adminPage.getByText('Product approved', { exact: true })).toBeVisible()
  await expect(rereviewDialog).toBeHidden()

  await merchantPage.goto('/merchant/products')
  await assertProductRow(merchantPage, product.updatedStock, 'Approved')
  await publicPage.goto('/stores/e2e-approved-store')
  const republishedProduct = publicPage.getByRole('link').filter({ hasText: product.name }).first()
  await expect(republishedProduct).toBeVisible()
  await expect(republishedProduct.getByText(product.reapprovedFormattedPrice, { exact: true })).toBeVisible()

  // Top-level inventory is operational: changing it does not reopen moderation.
  await productRow(merchantPage).getByRole('link', { name: product.name, exact: true }).click()
  await merchantPage.getByPlaceholder('0', { exact: true }).fill(product.inventoryOnlyStock)
  await merchantPage.getByRole('button', { name: 'Save changes', exact: true }).click()
  await expect(merchantPage.getByText('Product updated', { exact: true })).toBeVisible()
  await assertProductRow(merchantPage, product.inventoryOnlyStock, 'Approved')
  await adminPage.goto('/admin/products')
  await expect(adminPage.getByRole('heading', { name: 'Queue is clear', exact: true })).toBeVisible()
  await publicPage.goto('/stores/e2e-approved-store')
  await expect(publicPage.getByRole('link').filter({ hasText: product.name }).first()).toBeVisible()

  await Promise.all([adminPage.context().close(), publicPage.context().close()])
})
