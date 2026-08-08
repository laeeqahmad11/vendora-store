import path from 'node:path'
import type { Browser, BrowserContext, Locator, Page } from '@playwright/test'
import { expect, installNetworkPolicy, test } from '../fixtures'
import {
  completeMerchantProductLifecycle,
  product,
  resetSeededEmulatorData,
} from './support/merchant-product-lifecycle'

const authState = (role: 'merchant' | 'admin') =>
  path.resolve('tests', '.auth', `${role}.json`)

const shipping = {
  fullName: 'E2E Customer',
  email: 'customer@e2e.vendora.test',
  line1: '27 Emulator Avenue',
  city: 'Lahore',
  province: 'Punjab',
  postalCode: '54000',
  country: 'Pakistan',
  instructions: 'Deterministic localhost E2E cancellation delivery.',
} as const

const cancellationReason = 'Cancelled by customer'
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
  // These timeline nodes are list items in the DOM, but role locators do not
  // currently match their text reliably in Chromium's accessibility tree.
  return container.locator('li').filter({ hasText: label }).first()
}

async function assertTimelineEntry(container: Locator, label: string, note: string) {
  const entry = timelineEntry(container, label)
  await expect(entry).toBeVisible()
  await expect(entry).toContainText(timestampPattern)
  await expect(entry).toContainText(note)
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

test.beforeEach(resetSeededEmulatorData)

test('customer cancellation restores stock and remains consistent across roles', async ({
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

    await expect(customerPage.getByRole('heading', { name: orderNumber, exact: true })).toBeVisible()
    await expect(
      customerPage.getByText('Pending', { exact: true }).filter({ visible: true }).first(),
    ).toBeVisible()
    await expect(
      customerPage.getByText(product.name, { exact: true }).filter({ visible: true }).first(),
    ).toBeVisible()
    await expect(
      customerPage
        .getByText(product.formattedPrice, { exact: true })
        .filter({ visible: true })
        .first(),
    ).toBeVisible()
    await expect(customerPage.getByText('Total (COD)', { exact: true })).toBeVisible()
    await assertTimelineEntry(customerPage.locator('body'), 'Pending', 'Order placed')
    await assertInventory(inventory.page, '26', '1')

    await customerPage.goto(customerOrderURL)
    await customerPage.getByRole('button', { name: 'Cancel order', exact: true }).click()

    const confirmation = customerPage.getByRole('dialog')
    await expect(
      confirmation.getByRole('heading', { name: 'Cancel this order?', exact: true }),
    ).toBeVisible()
    await expect(confirmation).toContainText(
      `Order ${orderNumber} will be cancelled and the items returned to stock. This cannot be undone.`,
    )
    await expect(confirmation.getByRole('textbox')).toHaveCount(0)
    await expect(confirmation.getByRole('button', { name: 'Cancel', exact: true })).toBeVisible()
    await confirmation.getByRole('button', { name: 'Cancel order', exact: true }).click()

    await expect(customerPage.getByText('Order cancelled', { exact: true })).toBeVisible()
    await expect(confirmation).toBeHidden()
    await expect(
      customerPage.getByText('Cancelled', { exact: true }).filter({ visible: true }).first(),
    ).toBeVisible()
    await assertTimelineEntry(customerPage.locator('body'), 'Cancelled', cancellationReason)
    await expect(customerPage.getByRole('button', { name: 'Cancel order', exact: true })).toHaveCount(0)

    await customerPage.reload()
    await expect(customerPage).toHaveURL(customerOrderURL)
    await expect(customerPage.getByRole('heading', { name: orderNumber, exact: true })).toBeVisible()
    await expect(
      customerPage.getByText('Cancelled', { exact: true }).filter({ visible: true }).first(),
    ).toBeVisible()
    await assertTimelineEntry(customerPage.locator('body'), 'Cancelled', cancellationReason)
    await expect(customerPage.getByRole('button', { name: 'Cancel order', exact: true })).toHaveCount(0)

    await assertInventory(inventory.page, '27', '0')
    await inventory.page.reload()
    await assertInventory(inventory.page, '27', '0')

    await customerPage.goto('/account/orders')
    await expect(customerPage.getByText(orderNumber, { exact: true })).toBeVisible()
    await expect(customerPage.getByText('Cancelled', { exact: true })).toBeVisible()
    await expect(customerPage.getByText(product.formattedPrice, { exact: true })).toBeVisible()
    await customerPage.getByRole('link', { name: 'View details', exact: true }).click()
    await expect(customerPage).toHaveURL(customerOrderURL)
    await expect(
      customerPage.getByText(product.name, { exact: true }).filter({ visible: true }).first(),
    ).toBeVisible()
    await expect(customerPage.getByText('Total (COD)', { exact: true })).toBeVisible()
    await assertTimelineEntry(customerPage.locator('body'), 'Cancelled', cancellationReason)

    await merchant.page.goto('/merchant/orders')
    await expect(merchant.page.getByRole('heading', { name: 'Orders', exact: true })).toBeVisible()
    const merchantRow = merchant.page
      .getByRole('link')
      .filter({ hasText: orderNumber })
      .filter({ hasText: shipping.fullName })
    await expect(merchantRow).toBeVisible()
    await expect(merchantRow.getByText('1', { exact: true })).toBeVisible()
    await expect(merchantRow.getByText(product.formattedPrice, { exact: true })).toBeVisible()
    await expect(merchantRow.getByText('COD Due', { exact: true })).toBeVisible()
    await expect(merchantRow.getByText('Cancelled', { exact: true })).toBeVisible()
    await merchantRow.getByRole('link', { name: orderNumber, exact: true }).click()

    await expect(
      merchant.page.getByRole('heading', { name: `Order ${orderNumber}`, exact: true }),
    ).toBeVisible()
    await expect(
      merchant.page.getByText('Cancelled', { exact: true }).filter({ visible: true }).first(),
    ).toBeVisible()
    await expect(
      merchant.page.getByText(shipping.fullName, { exact: true }).filter({ visible: true }).first(),
    ).toBeVisible()
    await expect(
      merchant.page.getByText(shipping.email, { exact: true }).filter({ visible: true }).first(),
    ).toBeVisible()
    await expect(merchant.page.getByText('Items (1)', { exact: true })).toBeVisible()
    await expect(
      merchant.page.getByText(product.name, { exact: true }).filter({ visible: true }).first(),
    ).toBeVisible()
    await expect(
      merchant.page.getByText('Total (COD)', { exact: true }).filter({ visible: true }).first(),
    ).toBeVisible()
    await assertTimelineEntry(merchant.page.locator('body'), 'Cancelled', cancellationReason)

    for (const action of [
      'Confirm order',
      'Mark packed',
      'Mark ready',
      'Mark dispatched',
      'Mark delivered',
      'Cash received',
      'Cancel order',
    ]) {
      await expect(merchant.page.getByRole('button', { name: action, exact: true })).toHaveCount(0)
    }

    await admin.page.goto('/admin/orders')
    await expect(admin.page.getByRole('heading', { name: 'Orders', exact: true })).toBeVisible()
    const adminRow = admin.page.getByRole('row').filter({ hasText: orderNumber })
    await expect(adminRow).toBeVisible()
    await expect(adminRow.getByText(shipping.fullName, { exact: true })).toBeVisible()
    await expect(adminRow.getByText('E2E Approved Store', { exact: true })).toBeVisible()
    await expect(adminRow.getByText('1', { exact: true })).toBeVisible()
    await expect(adminRow.getByText(product.formattedPrice, { exact: true })).toBeVisible()
    await expect(adminRow.getByText('Cancelled', { exact: true })).toBeVisible()
    await adminRow.click()

    const adminDialog = admin.page.getByRole('dialog')
    await expect(adminDialog.getByRole('heading')).toContainText(orderNumber)
    await expect(adminDialog.getByRole('heading')).toContainText('Cancelled')
    await expect(adminDialog).toContainText(shipping.fullName)
    await expect(adminDialog).toContainText(shipping.email)
    await expect(adminDialog).toContainText('E2E Approved Store')
    await expect(adminDialog).toContainText(product.name)
    await expect(adminDialog).toContainText(product.formattedPrice)
    await expect(adminDialog).toContainText(/1\s+.*\$2,900\.00/)
    await expect(adminDialog).toContainText('cash on delivery')
    await expect(adminDialog).not.toContainText('(received)')
    await expect(adminDialog).toContainText(`Cancel reason: ${cancellationReason}`)
    await assertTimelineEntry(adminDialog, 'Cancelled', cancellationReason)

    await adminDialog.getByRole('button', { name: 'Close', exact: true }).click()
    await expect(adminDialog).toBeHidden()

    await admin.page.goto('/admin/activity')
    await expect(admin.page.getByRole('heading', { name: 'Activity Log', exact: true })).toBeVisible()
    const activityRows = admin.page.getByRole('row').filter({ hasText: orderNumber })
    await expect(activityRows).toHaveCount(2)
    await expect(activityRows.filter({ hasText: 'order.placed' })).toHaveCount(1)
    const cancellationActivity = activityRows.filter({ hasText: 'order.status_changed' })
    await expect(cancellationActivity).toHaveCount(1)
    await expect(cancellationActivity).toContainText('E2E Customer')
    await expect(cancellationActivity).toContainText('customer')
    await expect(cancellationActivity).toContainText('cancelled')

    console.info(
      `ORDER_CANCELLATION_E2E order=${orderNumber} actor=customer status=pending->cancelled ` +
        `reason="${cancellationReason}" stock=27->26->27 sold=0->1->0 ` +
        'inventoryLogs=0 activityLogs=2 cashReceived=false invalidActions=absent',
    )
  } finally {
    await Promise.all(openedContexts.map((context) => context.close()))
  }
})
