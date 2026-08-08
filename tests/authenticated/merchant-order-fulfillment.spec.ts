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
  phone: '03001234567',
  email: 'customer@e2e.vendora.test',
  line1: '27 Emulator Avenue',
  city: 'Lahore',
  province: 'Punjab',
  postalCode: '54000',
  country: 'Pakistan',
  instructions: 'Deterministic localhost E2E fulfillment delivery.',
} as const

const fulfillmentTransitions = [
  { action: 'Confirm order', status: 'Confirmed' },
  { action: 'Mark packed', status: 'Packed' },
  { action: 'Mark ready', status: 'Ready' },
  { action: 'Mark dispatched', status: 'Dispatched' },
  { action: 'Mark delivered', status: 'Delivered' },
] as const

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

function adminProductRow(page: Page) {
  return page.getByRole('row').filter({ hasText: product.name })
}

async function approveProduct(adminPage: Page) {
  await adminPage.goto('/admin/products')
  await expect(adminPage).toHaveURL('/admin/products')

  const pendingRow = adminProductRow(adminPage)
  await expect(pendingRow).toBeVisible()
  await pendingRow.getByRole('button', { name: 'Review', exact: true }).click()

  const reviewDialog = adminPage.getByRole('dialog')
  await expect(reviewDialog.getByRole('heading', { name: product.name, exact: true })).toBeVisible()
  await reviewDialog.getByRole('button', { name: 'Approve', exact: true }).click()

  await expect(adminPage.getByText('Product approved', { exact: true })).toBeVisible()
  await expect(reviewDialog).toBeHidden()
}

async function placeCodOrder(customerPage: Page) {
  await customerPage.goto('/stores/e2e-approved-store')
  await expect(customerPage.getByRole('heading', { name: /^E2E Approved Store/ })).toBeVisible()

  const customerProduct = customerPage.getByRole('link').filter({ hasText: product.name }).first()
  await expect(customerProduct).toBeVisible()
  await customerProduct.click()

  await expect(customerPage).toHaveURL(/\/products\/[^/]+$/)
  await expect(customerPage.getByRole('heading', { name: product.name, exact: true })).toBeVisible()
  await customerPage.getByRole('button', { name: 'Add to cart', exact: true }).click()
  await expect(customerPage.getByText('Added to cart', { exact: true })).toBeVisible()

  const cartLink = customerPage
    .getByRole('link', { name: 'Cart with 1 items', exact: true })
    .filter({ visible: true })
  await expect(cartLink).toBeVisible()
  await cartLink.click()

  await expect(customerPage).toHaveURL('/cart')
  await expect(customerPage.getByText(product.name, { exact: true })).toBeVisible()
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
  await expect(customerPage.getByText('Cash on delivery', { exact: true })).toBeVisible()

  await customerPage.getByRole('link', { name: 'Track order', exact: true }).click()
  await expect(customerPage).toHaveURL(/\/account\/orders\/[^/]+$/)

  return orderNumber!
}

function merchantTimeline(page: Page) {
  return page.locator('body')
}

function customerTimeline(page: Page) {
  return page.locator('body')
}

function timelineEntry(container: Locator, label: string) {
  // Playwright exposes these nodes as listitems in snapshots, but role locators
  // do not currently match their text reliably; scope the fallback to timeline li elements.
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

async function assertMerchantStatus(page: Page, status: string) {
  await expect(page.getByRole('heading', { name: 'Timeline', exact: true })).toBeVisible()
  await expect(page.getByText(status, { exact: true }).filter({ visible: true }).first()).toBeVisible()
  await assertTimelineEntry(merchantTimeline(page), status)
}

async function assertCustomerOrder(
  page: Page,
  orderNumber: string,
  status: string,
  expectedTimeline: readonly string[],
) {
  await page.reload()
  await expect(page.getByRole('heading', { name: orderNumber, exact: true })).toBeVisible()
  await expect(page.getByText(status, { exact: true }).first()).toBeVisible()
  await expect(page.getByText(product.name, { exact: true }).first()).toBeVisible()
  await expect(
    page.getByText(product.formattedPrice, { exact: true }).filter({ visible: true }).first(),
  ).toBeVisible()
  await expect(page.getByText('Total (COD)', { exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Order timeline', exact: true })).toBeVisible()

  const timeline = customerTimeline(page)
  for (const entry of expectedTimeline) await assertTimelineEntry(timeline, entry)
}

async function assertAdminOrder(
  page: Page,
  orderNumber: string,
  status: string,
  expectedTimeline: readonly string[],
  cashReceived: boolean,
) {
  await page.goto('/admin/orders')
  await expect(page.getByRole('heading', { name: 'Orders', exact: true })).toBeVisible()

  const row = page.getByRole('row').filter({ hasText: orderNumber })
  await expect(row).toBeVisible()
  await expect(row.getByText(shipping.fullName, { exact: true })).toBeVisible()
  await expect(row.getByText('E2E Approved Store', { exact: true })).toBeVisible()
  await expect(row.getByText(product.formattedPrice, { exact: true })).toBeVisible()
  await expect(row.getByText(status, { exact: true })).toBeVisible()
  await row.click()

  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('heading')).toContainText(orderNumber)
  await expect(dialog.getByRole('heading')).toContainText(status)
  await expect(dialog).toContainText(product.name)
  await expect(dialog).toContainText(product.formattedPrice)
  await expect(dialog).toContainText(/1\s+.*\$2,900\.00/)
  await expect(dialog).toContainText(cashReceived ? 'cash on delivery (received)' : 'cash on delivery')
  if (!cashReceived) await expect(dialog).not.toContainText('(received)')

  for (const entry of expectedTimeline) await assertTimelineEntry(dialog, entry)
  await dialog.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(dialog).toBeHidden()
}

test.beforeEach(resetSeededEmulatorData)

test('merchant fulfills a COD order consistently across customer, admin, and inventory', async ({
  baseURL,
  browser,
  page: customerPage,
}) => {
  test.setTimeout(240_000)
  const appURL = baseURL ?? 'http://127.0.0.1:5173'
  const openedContexts: BrowserContext[] = []

  try {
    const merchant = await newSafePage(browser, appURL, authState('merchant'))
    const inventory = await newSafePage(browser, appURL, authState('merchant'))
    const admin = await newSafePage(browser, appURL, authState('admin'))
    openedContexts.push(merchant.context, inventory.context, admin.context)

    await completeMerchantProductLifecycle(merchant.page)
    await approveProduct(admin.page)
    await assertInventory(inventory.page, product.updatedStock, '0')

    const orderNumber = await placeCodOrder(customerPage)
    const customerOrderURL = customerPage.url()
    await assertCustomerOrder(customerPage, orderNumber, 'Pending', ['Pending'])
    await assertTimelineEntry(customerTimeline(customerPage), 'Pending', 'Order placed')
    await assertInventory(inventory.page, '26', '1')

    await merchant.page.goto('/merchant/orders')
    await expect(merchant.page.getByRole('heading', { name: 'Orders', exact: true })).toBeVisible()
    const merchantOrderRow = merchant.page
      .getByRole('link')
      .filter({ hasText: orderNumber })
      .filter({ hasText: shipping.fullName })
    await expect(merchantOrderRow).toBeVisible()
    await expect(merchantOrderRow.getByText(shipping.fullName, { exact: true })).toBeVisible()
    await expect(merchantOrderRow.getByText('1', { exact: true })).toBeVisible()
    await expect(merchantOrderRow.getByText(product.formattedPrice, { exact: true })).toBeVisible()
    await expect(merchantOrderRow.getByText('COD Due', { exact: true })).toBeVisible()
    await expect(merchantOrderRow.getByText('Pending', { exact: true })).toBeVisible()
    await merchantOrderRow.getByRole('link', { name: orderNumber, exact: true }).click()

    await expect(merchant.page).toHaveURL(/\/merchant\/orders\/[^/]+$/)
    const merchantOrderURL = merchant.page.url()
    await expect(
      merchant.page.getByRole('heading', { name: `Order ${orderNumber}`, exact: true }),
    ).toBeVisible()
    await expect(
      merchant.page.getByText(shipping.fullName, { exact: true }).filter({ visible: true }).first(),
    ).toBeVisible()
    await expect(
      merchant.page.getByText(shipping.email, { exact: true }).filter({ visible: true }).first(),
    ).toBeVisible()
    await expect(
      merchant.page.getByText(product.name, { exact: true }).filter({ visible: true }).first(),
    ).toBeVisible()
    await expect(merchant.page.getByText('Items (1)', { exact: true })).toBeVisible()
    await expect(
      merchant.page.getByText(product.formattedPrice, { exact: true }).filter({ visible: true }).first(),
    ).toBeVisible()
    await expect(
      merchant.page.getByText('Total (COD)', { exact: true }).filter({ visible: true }).first(),
    ).toBeVisible()
    await assertMerchantStatus(merchant.page, 'Pending')
    await assertTimelineEntry(merchantTimeline(merchant.page), 'Pending', 'Order placed')
    await assertAdminOrder(admin.page, orderNumber, 'Pending', ['Pending'], false)

    const timeline: string[] = ['Pending']
    for (const transition of fulfillmentTransitions) {
      await merchant.page.getByRole('button', { name: transition.action, exact: true }).click()
      await expect(
        merchant.page.getByText('Order updated', { exact: true }).filter({ visible: true }),
      ).toBeVisible()

      timeline.push(transition.status)
      await assertMerchantStatus(merchant.page, transition.status)
      await merchant.page.reload()
      await expect(merchant.page).toHaveURL(merchantOrderURL)
      await assertMerchantStatus(merchant.page, transition.status)

      await customerPage.goto(customerOrderURL)
      await assertCustomerOrder(customerPage, orderNumber, transition.status, timeline)
      await assertAdminOrder(admin.page, orderNumber, transition.status, timeline, false)
      await assertInventory(inventory.page, '26', '1')
    }

    await inventory.page.goto('/merchant/orders')
    const deliveredRow = inventory.page.getByRole('link').filter({ hasText: orderNumber }).first()
    await expect(deliveredRow.getByText('Delivered', { exact: true })).toBeVisible()
    await expect(deliveredRow.getByText('COD Due', { exact: true })).toBeVisible()

    await merchant.page.getByRole('button', { name: 'Cash received', exact: true }).click()
    const cashDialog = merchant.page.getByRole('dialog')
    await expect(
      cashDialog.getByRole('heading', { name: 'Confirm cash received?', exact: true }),
    ).toBeVisible()
    await cashDialog.getByRole('button', { name: 'Yes, cash received', exact: true }).click()
    await expect(
      merchant.page
        .getByText('Payment confirmed — order completed', { exact: true })
        .filter({ visible: true }),
    ).toBeVisible()

    timeline.push('Cash received', 'Completed')
    await assertMerchantStatus(merchant.page, 'Completed')
    await expect(
      merchant.page
        .getByText(/^Cash received\s+/)
        .filter({ visible: true })
        .first(),
    ).toBeVisible()
    await assertTimelineEntry(merchantTimeline(merchant.page), 'Cash received', 'Cash payment confirmed')
    await assertTimelineEntry(merchantTimeline(merchant.page), 'Completed', 'Order completed automatically')

    await merchant.page.reload()
    await assertMerchantStatus(merchant.page, 'Completed')
    await expect(merchant.page.getByRole('button', { name: 'Cash received', exact: true })).toHaveCount(0)

    await customerPage.goto(customerOrderURL)
    await assertCustomerOrder(customerPage, orderNumber, 'Completed', timeline)
    await assertTimelineEntry(customerTimeline(customerPage), 'Cash received', 'Cash payment confirmed')
    await assertTimelineEntry(customerTimeline(customerPage), 'Completed', 'Order completed automatically')
    await assertAdminOrder(admin.page, orderNumber, 'Completed', timeline, true)
    await assertInventory(inventory.page, '26', '1')

    await inventory.page.goto('/merchant/orders')
    const completedRow = inventory.page.getByRole('link').filter({ hasText: orderNumber }).first()
    await expect(completedRow.getByText('Completed', { exact: true })).toBeVisible()
    await expect(completedRow.getByText('COD Received', { exact: true })).toBeVisible()

    await admin.page.goto('/admin/activity')
    await expect(admin.page.getByRole('heading', { name: 'Activity Log', exact: true })).toBeVisible()
    const orderActivityRows = admin.page.getByRole('row').filter({ hasText: orderNumber })
    await expect(orderActivityRows).toHaveCount(7)
    await expect(orderActivityRows.filter({ hasText: 'order.placed' })).toHaveCount(1)
    await expect(orderActivityRows.filter({ hasText: 'order.status_changed' })).toHaveCount(5)
    await expect(orderActivityRows.filter({ hasText: 'order.cash_received' })).toHaveCount(1)

    console.info(
      `MERCHANT_FULFILLMENT_E2E order=${orderNumber} lifecycle=pending->confirmed->packed->ready->dispatched->delivered->completed stock=27->26->26 sold=0->1->1 inventoryLogs=0 activityLogs=7 cashReceived=true`,
    )
  } finally {
    await Promise.all(openedContexts.map((context) => context.close()))
  }
})
