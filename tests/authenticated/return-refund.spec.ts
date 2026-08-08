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
  instructions: 'Deterministic localhost E2E return delivery.',
} as const

const returnReason = 'E2E return request'
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

async function assertCustomerOrder(page: Page, orderNumber: string, status: string) {
  await expect(page.getByRole('heading', { name: orderNumber, exact: true })).toBeVisible()
  await expect(page.getByText(status, { exact: true }).filter({ visible: true }).first()).toBeVisible()
  await expect(page.getByText(product.name, { exact: true }).filter({ visible: true }).first()).toBeVisible()
  await expect(
    page.getByText(product.formattedPrice, { exact: true }).filter({ visible: true }).first(),
  ).toBeVisible()
  await expect(page.getByText('Total (COD)', { exact: true })).toBeVisible()
}

async function openAdminOrder(
  page: Page,
  orderNumber: string,
  status: string,
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
  await expect(dialog).toContainText(
    cashReceived ? 'cash on delivery (received)' : 'cash on delivery',
  )
  if (!cashReceived) await expect(dialog).not.toContainText('(received)')
  return dialog
}

async function closeAdminOrder(dialog: Locator) {
  await dialog.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(dialog).toBeHidden()
}

test.beforeEach(resetSeededEmulatorData)

test('customer return request and merchant approval preserve actual inventory and COD behavior', async ({
  baseURL,
  browser,
  page: customerPage,
}) => {
  test.setTimeout(300_000)
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
    await assertCustomerOrder(customerPage, orderNumber, 'Pending')
    await expect(customerPage.getByRole('button', { name: 'Request return', exact: true })).toHaveCount(0)
    await assertInventory(inventory.page, '26', '1')

    await merchant.page.goto('/merchant/orders')
    await expect(merchant.page.getByRole('heading', { name: 'Orders', exact: true })).toBeVisible()
    const merchantRow = merchant.page
      .getByRole('link')
      .filter({ hasText: orderNumber })
      .filter({ hasText: shipping.fullName })
    await expect(merchantRow).toBeVisible()
    await merchantRow.getByRole('link', { name: orderNumber, exact: true }).click()
    await expect(merchant.page).toHaveURL(/\/merchant\/orders\/[^/]+$/)
    const merchantOrderURL = merchant.page.url()

    for (const transition of fulfillmentTransitions) {
      await merchant.page.getByRole('button', { name: transition.action, exact: true }).click()
      await expect(
        merchant.page
          .getByText('Order updated', { exact: true })
          .filter({ visible: true })
          .last(),
      ).toBeVisible()
      await expect(
        merchant.page.getByText(transition.status, { exact: true }).filter({ visible: true }).first(),
      ).toBeVisible()
    }

    await customerPage.goto(customerOrderURL)
    await assertCustomerOrder(customerPage, orderNumber, 'Delivered')
    await expect(customerPage.getByRole('button', { name: 'Request return', exact: true })).toBeVisible()
    let adminDialog = await openAdminOrder(admin.page, orderNumber, 'Delivered', false)
    await closeAdminOrder(adminDialog)
    await assertInventory(inventory.page, '26', '1')

    await merchant.page.goto(merchantOrderURL)
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
    await expect(
      merchant.page.getByText('Completed', { exact: true }).filter({ visible: true }).first(),
    ).toBeVisible()
    await expect(merchant.page.getByText(/^Cash received\s+/).filter({ visible: true }).first()).toBeVisible()

    await customerPage.goto(customerOrderURL)
    await assertCustomerOrder(customerPage, orderNumber, 'Completed')
    await expect(customerPage.getByRole('button', { name: 'Request return', exact: true })).toBeVisible()
    await assertTimelineEntry(customerPage.locator('body'), 'Cash received', 'Cash payment confirmed')
    await assertTimelineEntry(customerPage.locator('body'), 'Completed', 'Order completed automatically')
    adminDialog = await openAdminOrder(admin.page, orderNumber, 'Completed', true)
    await closeAdminOrder(adminDialog)
    await assertInventory(inventory.page, '26', '1')

    await customerPage.goto(customerOrderURL)
    await customerPage.getByRole('button', { name: 'Request return', exact: true }).click()
    const requestDialog = customerPage.getByRole('dialog')
    await expect(
      requestDialog.getByRole('heading', { name: 'Request a return', exact: true }),
    ).toBeVisible()
    await expect(requestDialog).toContainText("Tell the merchant why you'd like to return this order.")
    const reasonInput = requestDialog.getByPlaceholder(/^Reason for return/)
    await expect(reasonInput).toBeVisible()
    await requestDialog.getByRole('button', { name: 'Submit request', exact: true }).click()
    await expect(
      customerPage.getByText('Please provide a reason for the return.', { exact: true }),
    ).toBeVisible()
    await expect(requestDialog).toBeVisible()

    await reasonInput.fill(returnReason)
    await requestDialog.getByRole('button', { name: 'Submit request', exact: true }).click()
    await expect(
      customerPage.getByText('Return requested — the merchant will contact you.', { exact: true }),
    ).toBeVisible()
    await expect(requestDialog).toBeHidden()
    await assertCustomerOrder(customerPage, orderNumber, 'Refund Requested')
    await assertTimelineEntry(customerPage.locator('body'), 'Refund Requested', returnReason)
    await expect(customerPage.getByRole('button', { name: 'Request return', exact: true })).toHaveCount(0)
    await expect(customerPage.getByRole('button', { name: 'Cancel order', exact: true })).toHaveCount(0)

    await customerPage.reload()
    await expect(customerPage).toHaveURL(customerOrderURL)
    await assertCustomerOrder(customerPage, orderNumber, 'Refund Requested')
    await assertTimelineEntry(customerPage.locator('body'), 'Refund Requested', returnReason)
    await assertInventory(inventory.page, '26', '1')

    await merchant.page.goto(merchantOrderURL)
    await expect(
      merchant.page.getByText('Refund Requested', { exact: true }).filter({ visible: true }).first(),
    ).toBeVisible()
    await expect(merchant.page.getByText(returnReason, { exact: true })).toBeVisible()
    await assertTimelineEntry(merchant.page.locator('body'), 'Refund Requested', returnReason)
    await expect(merchant.page.getByRole('button', { name: 'Approve return', exact: true })).toBeVisible()
    await expect(merchant.page.getByRole('button', { name: 'Decline refund', exact: true })).toBeVisible()
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

    adminDialog = await openAdminOrder(admin.page, orderNumber, 'Refund Requested', true)
    await assertTimelineEntry(adminDialog, 'refund requested', returnReason)
    await expect(adminDialog.getByRole('button', { name: 'Approve return', exact: true })).toHaveCount(0)
    await expect(adminDialog.getByRole('button', { name: 'Decline refund', exact: true })).toHaveCount(0)
    await closeAdminOrder(adminDialog)

    await merchant.page.getByRole('button', { name: 'Approve return', exact: true }).click()
    const approvalDialog = merchant.page.getByRole('dialog')
    await expect(
      approvalDialog.getByRole('heading', { name: 'Approve return?', exact: true }),
    ).toBeVisible()
    await expect(approvalDialog).toContainText(
      'The order will be marked as returned. Arrange the pickup/refund with the customer directly.',
    )
    await approvalDialog.getByRole('button', { name: 'Approve return', exact: true }).click()
    await expect(merchant.page.getByText('Return approved', { exact: true })).toBeVisible()
    await expect(
      merchant.page.getByText('Returned', { exact: true }).filter({ visible: true }).first(),
    ).toBeVisible()
    await assertTimelineEntry(merchant.page.locator('body'), 'Returned', 'Return approved by merchant')
    await assertTimelineEntry(merchant.page.locator('body'), 'Refund Requested', returnReason)

    for (const action of [
      'Approve return',
      'Decline refund',
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

    await merchant.page.reload()
    await expect(merchant.page).toHaveURL(merchantOrderURL)
    await expect(
      merchant.page.getByText('Returned', { exact: true }).filter({ visible: true }).first(),
    ).toBeVisible()
    await expect(merchant.page.getByText(/^Cash received\s+/).filter({ visible: true }).first()).toBeVisible()
    await assertTimelineEntry(merchant.page.locator('body'), 'Returned', 'Return approved by merchant')

    await customerPage.goto(customerOrderURL)
    await assertCustomerOrder(customerPage, orderNumber, 'Returned')
    await assertTimelineEntry(customerPage.locator('body'), 'Refund Requested', returnReason)
    await assertTimelineEntry(customerPage.locator('body'), 'Returned', 'Return approved by merchant')
    await expect(customerPage.getByRole('button', { name: 'Request return', exact: true })).toHaveCount(0)
    await expect(customerPage.getByRole('button', { name: 'Cancel order', exact: true })).toHaveCount(0)

    adminDialog = await openAdminOrder(admin.page, orderNumber, 'Returned', true)
    await assertTimelineEntry(adminDialog, 'refund requested', returnReason)
    await assertTimelineEntry(adminDialog, 'returned', 'Return approved by merchant')
    await expect(adminDialog.getByRole('button', { name: 'Approve return', exact: true })).toHaveCount(0)
    await closeAdminOrder(adminDialog)

    await assertInventory(inventory.page, '26', '1')
    await inventory.page.reload()
    await assertInventory(inventory.page, '26', '1')

    await inventory.page.goto('/merchant/orders')
    const returnedRow = inventory.page.getByRole('link').filter({ hasText: orderNumber }).first()
    await expect(returnedRow.getByText('Returned', { exact: true })).toBeVisible()
    await expect(returnedRow.getByText('COD Received', { exact: true })).toBeVisible()

    await admin.page.goto('/admin/activity')
    await expect(admin.page.getByRole('heading', { name: 'Activity Log', exact: true })).toBeVisible()
    const activityRows = admin.page.getByRole('row').filter({ hasText: orderNumber })
    await expect(activityRows).toHaveCount(9)
    await expect(activityRows.filter({ hasText: 'order.placed' })).toHaveCount(1)
    await expect(activityRows.filter({ hasText: 'order.status_changed' })).toHaveCount(7)
    await expect(activityRows.filter({ hasText: 'order.cash_received' })).toHaveCount(1)

    const requestActivity = activityRows.filter({ hasText: 'refund_requested' })
    await expect(requestActivity).toHaveCount(1)
    await expect(requestActivity).toContainText('E2E Customer')
    await expect(requestActivity).toContainText('customer')

    const approvalActivity = activityRows.filter({ hasText: 'returned' })
    await expect(approvalActivity).toHaveCount(1)
    await expect(approvalActivity).toContainText('E2E Merchant')
    await expect(approvalActivity).toContainText('merchant')

    console.info(
      `RETURN_REFUND_E2E order=${orderNumber} actor=customer status=completed->refund_requested->returned ` +
        `reason="${returnReason}" stock=27->26->26->26 sold=0->1->1->1 ` +
        'inventoryRestoration=none inventoryLogs=0 activityLogs=9 cashReceived=true->true ' +
        'merchantAction=approve adminAction=read-only invalidActions=absent',
    )
  } finally {
    await Promise.all(openedContexts.map((context) => context.close()))
  }
})
