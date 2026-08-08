import path from 'node:path'
import type { Browser, BrowserContext, Locator, Page } from '@playwright/test'
import { expect, installNetworkPolicy, test } from '../fixtures'
import {
  completeMerchantProductLifecycle,
  product,
  resetSeededEmulatorData,
} from './support/merchant-product-lifecycle'

const authState = (role: 'merchant' | 'admin') => path.resolve('tests', '.auth', `${role}.json`)

const shipping = {
  fullName: 'E2E Customer',
  email: 'customer@e2e.vendora.test',
  line1: '27 Emulator Avenue',
  city: 'Lahore',
  province: 'Punjab',
  postalCode: '54000',
  country: 'Pakistan',
  instructions: 'Deterministic localhost E2E merchant cancellation delivery.',
} as const

const pendingReason = 'E2E merchant cancellation'
const confirmedReason = 'E2E merchant cancellation after confirmation'
const timestampPattern = /[A-Z][a-z]{2} \d{1,2}, \d{4} \d{1,2}:\d{2} [AP]M/

async function newSafePage(
  browser: Browser,
  baseURL: string,
  storageState: string,
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({
    baseURL,
    serviceWorkers: 'block',
    storageState,
  })
  const page = await context.newPage()
  await installNetworkPolicy(page, baseURL, true)
  return { context, page }
}

async function approveProduct(adminPage: Page) {
  await adminPage.goto('/admin/products')
  await expect(adminPage).toHaveURL('/admin/products')

  const row = adminPage.getByRole('row').filter({ hasText: product.name })
  await expect(row).toBeVisible()
  await row.getByRole('button', { name: 'Review', exact: true }).click()

  const dialog = adminPage.getByRole('dialog')
  await expect(dialog.getByRole('heading', { name: product.name, exact: true })).toBeVisible()
  await dialog.getByRole('button', { name: 'Approve', exact: true }).click()
  await expect(adminPage.getByText('Product approved', { exact: true })).toBeVisible()
  await expect(dialog).toBeHidden()
}

async function placeCodOrder(customerPage: Page) {
  await customerPage.goto('/stores/e2e-approved-store')
  await expect(customerPage.getByRole('heading', { name: /^E2E Approved Store/ })).toBeVisible()

  const productLink = customerPage.getByRole('link').filter({ hasText: product.name }).first()
  await expect(productLink).toBeVisible()
  await productLink.click()
  await expect(customerPage).toHaveURL(/\/products\/[^/]+$/)

  await customerPage.getByRole('button', { name: 'Add to cart', exact: true }).click()
  await expect(customerPage.getByText('Added to cart', { exact: true })).toBeVisible()
  await customerPage
    .getByRole('link', { name: 'Cart with 1 items', exact: true })
    .filter({ visible: true })
    .click()

  await expect(customerPage).toHaveURL('/cart')
  await customerPage.getByRole('button', { name: 'Proceed to checkout', exact: true }).click()
  await expect(customerPage).toHaveURL('/checkout')

  await customerPage.getByPlaceholder('Street address', { exact: true }).fill(shipping.line1)
  await customerPage.locator('input[autocomplete="address-level2"]').fill(shipping.city)
  await customerPage.locator('input[autocomplete="address-level1"]').fill(shipping.province)
  await customerPage.locator('input[autocomplete="postal-code"]').fill(shipping.postalCode)
  await customerPage.locator('input[autocomplete="country-name"]').fill(shipping.country)
  await customerPage
    .getByPlaceholder('Delivery notes for the courier (optional)', { exact: true })
    .fill(shipping.instructions)
  await expect(customerPage.getByText('Cash on Delivery', { exact: true })).toBeVisible()

  await customerPage.getByRole('button', { name: 'Place order', exact: true }).click()
  await expect(customerPage).toHaveURL('/order-success')

  const orderNumber = (await customerPage.getByText(/^VND-[A-Z2-9]{6}$/).textContent())?.trim()
  expect(orderNumber).toMatch(/^VND-[A-Z2-9]{6}$/)
  await customerPage.getByRole('link', { name: 'Track order', exact: true }).click()
  await expect(customerPage).toHaveURL(/\/account\/orders\/[^/]+$/)
  return orderNumber!
}

function timelineEntry(container: Locator, label: string) {
  return container.locator('li').filter({ hasText: label }).first()
}

async function assertTimelineEntry(container: Locator, label: string, note?: string) {
  const entry = timelineEntry(container, label)
  await expect(entry).toBeVisible()
  await expect(entry).toContainText(timestampPattern)
  if (note) await expect(entry).toContainText(note)
}

async function assertInventory(page: Page, stock: string, sold: string) {
  await page.goto('/merchant/inventory')
  await expect(page.getByRole('heading', { name: 'Inventory', exact: true })).toBeVisible()
  const row = page.getByRole('row').filter({ hasText: product.name })
  await expect(row).toBeVisible()
  await expect(row.getByText(stock, { exact: true })).toBeVisible()
  await expect(row.getByText(sold, { exact: true })).toBeVisible()
  await expect(row.getByText('In stock', { exact: true })).toBeVisible()
  await expect(page.getByText('No stock movements yet', { exact: true })).toBeVisible()
}

async function openMerchantOrder(page: Page, orderNumber: string) {
  await page.goto('/merchant/orders')
  await expect(page.getByRole('heading', { name: 'Orders', exact: true })).toBeVisible()
  const row = page.getByRole('link').filter({ hasText: orderNumber }).filter({ hasText: shipping.fullName })
  await expect(row).toBeVisible()
  await expect(row.getByText('1', { exact: true })).toBeVisible()
  await expect(row.getByText(product.formattedPrice, { exact: true })).toBeVisible()
  await expect(row.getByText('COD Due', { exact: true })).toBeVisible()
  await row.getByRole('link', { name: orderNumber, exact: true }).click()
  await expect(page).toHaveURL(/\/merchant\/orders\/[^/]+$/)
  await expect(page.getByRole('heading', { name: `Order ${orderNumber}`, exact: true })).toBeVisible()
}

async function cancelFromMerchant(page: Page, orderNumber: string, reason: string) {
  const cancelButton = page.getByRole('button', { name: 'Cancel order', exact: true })
  await expect(cancelButton).toBeVisible()
  await cancelButton.click()

  const dialog = page.getByRole('dialog')
  await expect(
    dialog.getByRole('heading', { name: `Cancel order ${orderNumber}?`, exact: true }),
  ).toBeVisible()
  await expect(dialog).toContainText('Stock will be restored and the customer notified.')

  const reasonField = dialog.getByRole('textbox')
  const confirmButton = dialog.getByRole('button', { name: 'Cancel order', exact: true })
  await expect(reasonField).toHaveValue('')
  await expect(confirmButton).toBeDisabled()
  await reasonField.fill('   ')
  await expect(confirmButton).toBeDisabled()
  await reasonField.fill(reason)
  await expect(confirmButton).toBeEnabled()
  await confirmButton.click()

  await expect(page.getByText('Order updated', { exact: true }).filter({ visible: true })).toBeVisible()
  await expect(dialog).toBeHidden()
  await expect(page.getByText('Cancelled', { exact: true }).filter({ visible: true }).first()).toBeVisible()
  await assertTimelineEntry(page.locator('body'), 'Cancelled', reason)
}

async function assertNoPostCancellationActions(page: Page) {
  for (const action of [
    'Confirm order',
    'Mark packed',
    'Mark ready',
    'Mark dispatched',
    'Mark delivered',
    'Cash received',
    'Cancel order',
  ]) {
    await expect(page.getByRole('button', { name: action, exact: true })).toHaveCount(0)
  }
}

async function assertCustomerCancelled(
  page: Page,
  orderNumber: string,
  orderURL: string,
  reason: string,
  wasConfirmed: boolean,
) {
  await page.goto('/account/orders')
  await expect(page.getByText(orderNumber, { exact: true })).toBeVisible()
  await expect(page.getByText('Cancelled', { exact: true })).toBeVisible()
  await expect(page.getByText(product.formattedPrice, { exact: true })).toBeVisible()
  await page.getByRole('link', { name: 'View details', exact: true }).click()
  await expect(page).toHaveURL(orderURL)
  await expect(page.getByRole('heading', { name: orderNumber, exact: true })).toBeVisible()
  await expect(page.getByText('Cancelled', { exact: true }).filter({ visible: true }).first()).toBeVisible()
  await expect(page.getByText(product.name, { exact: true }).filter({ visible: true }).first()).toBeVisible()
  await expect(
    page.getByText(product.formattedPrice, { exact: true }).filter({ visible: true }).first(),
  ).toBeVisible()
  await expect(page.getByText('Total (COD)', { exact: true })).toBeVisible()
  await assertTimelineEntry(page.locator('body'), 'Pending', 'Order placed')
  if (wasConfirmed) await assertTimelineEntry(page.locator('body'), 'Confirmed')
  await assertTimelineEntry(page.locator('body'), 'Cancelled', reason)
  await expect(page.getByRole('button', { name: 'Cancel order', exact: true })).toHaveCount(0)
}

async function assertMerchantCancelled(page: Page, orderNumber: string, reason: string) {
  await openMerchantOrder(page, orderNumber)
  await expect(page.getByText('Cancelled', { exact: true }).filter({ visible: true }).first()).toBeVisible()
  await expect(
    page.getByText(shipping.fullName, { exact: true }).filter({ visible: true }).first(),
  ).toBeVisible()
  await expect(
    page.getByText(shipping.email, { exact: true }).filter({ visible: true }).first(),
  ).toBeVisible()
  await expect(page.getByText('Items (1)', { exact: true })).toBeVisible()
  await expect(page.getByText(product.name, { exact: true }).filter({ visible: true }).first()).toBeVisible()
  await expect(page.getByText('Total (COD)', { exact: true }).filter({ visible: true }).first()).toBeVisible()
  await assertTimelineEntry(page.locator('body'), 'Cancelled', reason)
  await assertNoPostCancellationActions(page)
}

async function assertAdminCancelled(page: Page, orderNumber: string, reason: string, wasConfirmed: boolean) {
  await page.goto('/admin/orders')
  await expect(page.getByRole('heading', { name: 'Orders', exact: true })).toBeVisible()
  const row = page.getByRole('row').filter({ hasText: orderNumber })
  await expect(row).toBeVisible()
  await expect(row.getByText(shipping.fullName, { exact: true })).toBeVisible()
  await expect(row.getByText('E2E Approved Store', { exact: true })).toBeVisible()
  await expect(row.getByText('1', { exact: true })).toBeVisible()
  await expect(row.getByText(product.formattedPrice, { exact: true })).toBeVisible()
  await expect(row.getByText('Cancelled', { exact: true })).toBeVisible()
  await row.click()

  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('heading')).toContainText(orderNumber)
  await expect(dialog.getByRole('heading')).toContainText('Cancelled')
  await expect(dialog).toContainText(shipping.fullName)
  await expect(dialog).toContainText(shipping.email)
  await expect(dialog).toContainText('E2E Approved Store')
  await expect(dialog).toContainText(product.name)
  await expect(dialog).toContainText(product.formattedPrice)
  await expect(dialog).toContainText(/1\s+.*\$2,900\.00/)
  await expect(dialog).toContainText('cash on delivery')
  await expect(dialog).not.toContainText('(received)')
  await expect(dialog).toContainText(`Cancel reason: ${reason}`)
  await assertTimelineEntry(dialog, 'Pending', 'Order placed')
  if (wasConfirmed) await assertTimelineEntry(dialog, 'Confirmed')
  await assertTimelineEntry(dialog, 'Cancelled', reason)
  await dialog.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(dialog).toBeHidden()
}

async function assertMerchantActivity(page: Page, orderNumber: string, expectedStatusChanges: number) {
  await page.goto('/admin/activity')
  await expect(page.getByRole('heading', { name: 'Activity Log', exact: true })).toBeVisible()
  const rows = page.getByRole('row').filter({ hasText: orderNumber })
  await expect(rows).toHaveCount(expectedStatusChanges + 1)
  await expect(rows.filter({ hasText: 'order.placed' })).toHaveCount(1)
  const statusChanges = rows.filter({ hasText: 'order.status_changed' })
  await expect(statusChanges).toHaveCount(expectedStatusChanges)
  for (const statusChange of await statusChanges.all()) {
    await expect(statusChange).toContainText('E2E Merchant')
    await expect(statusChange).toContainText('merchant')
  }
  await expect(statusChanges.filter({ hasText: 'cancelled' })).toHaveCount(1)
}

test.beforeEach(resetSeededEmulatorData)

test('merchant cancels a pending COD order consistently across roles', async ({
  baseURL,
  browser,
  page: customerPage,
}) => {
  test.setTimeout(180_000)
  const appURL = baseURL ?? 'http://127.0.0.1:5173'
  const openedContexts: BrowserContext[] = []

  try {
    const merchant = await newSafePage(browser, appURL, authState('merchant'))
    const inventory = await newSafePage(browser, appURL, authState('merchant'))
    const admin = await newSafePage(browser, appURL, authState('admin'))
    openedContexts.push(merchant.context, inventory.context, admin.context)

    await completeMerchantProductLifecycle(merchant.page)
    await approveProduct(admin.page)
    await assertInventory(inventory.page, '27', '0')

    const orderNumber = await placeCodOrder(customerPage)
    const customerOrderURL = customerPage.url()
    await expect(
      customerPage.getByText('Pending', { exact: true }).filter({ visible: true }).first(),
    ).toBeVisible()
    await assertInventory(inventory.page, '26', '1')

    await openMerchantOrder(merchant.page, orderNumber)
    const merchantOrderURL = merchant.page.url()
    await expect(
      merchant.page.getByText('Pending', { exact: true }).filter({ visible: true }).first(),
    ).toBeVisible()
    await cancelFromMerchant(merchant.page, orderNumber, pendingReason)
    await assertNoPostCancellationActions(merchant.page)

    await merchant.page.reload()
    await expect(merchant.page).toHaveURL(merchantOrderURL)
    await expect(
      merchant.page.getByText('Cancelled', { exact: true }).filter({ visible: true }).first(),
    ).toBeVisible()
    await assertTimelineEntry(merchant.page.locator('body'), 'Cancelled', pendingReason)
    await assertNoPostCancellationActions(merchant.page)

    await assertInventory(inventory.page, '27', '0')
    await inventory.page.reload()
    await assertInventory(inventory.page, '27', '0')

    await assertCustomerCancelled(customerPage, orderNumber, customerOrderURL, pendingReason, false)
    await assertMerchantCancelled(merchant.page, orderNumber, pendingReason)
    await assertAdminCancelled(admin.page, orderNumber, pendingReason, false)
    await assertMerchantActivity(admin.page, orderNumber, 1)

    console.info(
      `MERCHANT_ORDER_CANCELLATION_E2E order=${orderNumber} actor=merchant ` +
        `status=pending->cancelled reason="${pendingReason}" stock=27->26->27 ` +
        'sold=0->1->0 inventoryLogs=0 activityLogs=2 cashReceived=false invalidActions=absent',
    )
  } finally {
    await Promise.all(openedContexts.map((context) => context.close()))
  }
})

test('merchant cancels a confirmed COD order consistently across roles', async ({
  baseURL,
  browser,
  page: customerPage,
}) => {
  test.setTimeout(180_000)
  const appURL = baseURL ?? 'http://127.0.0.1:5173'
  const openedContexts: BrowserContext[] = []

  try {
    const merchant = await newSafePage(browser, appURL, authState('merchant'))
    const inventory = await newSafePage(browser, appURL, authState('merchant'))
    const admin = await newSafePage(browser, appURL, authState('admin'))
    openedContexts.push(merchant.context, inventory.context, admin.context)

    await completeMerchantProductLifecycle(merchant.page)
    await approveProduct(admin.page)
    await assertInventory(inventory.page, '27', '0')

    const orderNumber = await placeCodOrder(customerPage)
    const customerOrderURL = customerPage.url()
    await assertInventory(inventory.page, '26', '1')

    await openMerchantOrder(merchant.page, orderNumber)
    const merchantOrderURL = merchant.page.url()
    await merchant.page.getByRole('button', { name: 'Confirm order', exact: true }).click()
    await expect(
      merchant.page.getByText('Order updated', { exact: true }).filter({ visible: true }),
    ).toBeVisible()
    await expect(
      merchant.page.getByText('Confirmed', { exact: true }).filter({ visible: true }).first(),
    ).toBeVisible()
    await assertTimelineEntry(merchant.page.locator('body'), 'Confirmed')
    await assertInventory(inventory.page, '26', '1')

    await merchant.page.goto(merchantOrderURL)
    await cancelFromMerchant(merchant.page, orderNumber, confirmedReason)
    await assertNoPostCancellationActions(merchant.page)

    await merchant.page.reload()
    await expect(merchant.page).toHaveURL(merchantOrderURL)
    await expect(
      merchant.page.getByText('Cancelled', { exact: true }).filter({ visible: true }).first(),
    ).toBeVisible()
    await assertTimelineEntry(merchant.page.locator('body'), 'Confirmed')
    await assertTimelineEntry(merchant.page.locator('body'), 'Cancelled', confirmedReason)
    await assertNoPostCancellationActions(merchant.page)

    await assertInventory(inventory.page, '27', '0')
    await inventory.page.reload()
    await assertInventory(inventory.page, '27', '0')

    await assertCustomerCancelled(customerPage, orderNumber, customerOrderURL, confirmedReason, true)
    await assertMerchantCancelled(merchant.page, orderNumber, confirmedReason)
    await assertAdminCancelled(admin.page, orderNumber, confirmedReason, true)
    await assertMerchantActivity(admin.page, orderNumber, 2)

    console.info(
      `MERCHANT_ORDER_CANCELLATION_E2E order=${orderNumber} actor=merchant ` +
        `status=pending->confirmed->cancelled reason="${confirmedReason}" stock=27->26->26->27 ` +
        'sold=0->1->1->0 inventoryLogs=0 activityLogs=3 cashReceived=false invalidActions=absent',
    )
  } finally {
    await Promise.all(openedContexts.map((context) => context.close()))
  }
})
