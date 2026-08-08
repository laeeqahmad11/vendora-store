import path from 'node:path'
import type { Browser, BrowserContext, Page } from '@playwright/test'
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
  phone: '03001234567',
  email: 'customer@e2e.vendora.test',
  line1: '27 Emulator Avenue',
  city: 'Lahore',
  province: 'Punjab',
  postalCode: '54000',
  country: 'Pakistan',
  instructions: 'Deterministic localhost E2E delivery.',
} as const

async function newSafePage(
  browser: Browser,
  baseURL: string,
  storageState?: string,
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({
    baseURL,
    serviceWorkers: 'block',
    storageState: storageState ?? { cookies: [], origins: [] },
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
  await expect(
    reviewDialog.getByRole('heading', { name: product.name, exact: true }),
  ).toBeVisible()
  await reviewDialog.getByRole('button', { name: 'Approve', exact: true }).click()

  await expect(adminPage.getByText('Product approved', { exact: true })).toBeVisible()
  await expect(reviewDialog).toBeHidden()
}

test.beforeEach(resetSeededEmulatorData)

test('customer places a COD order visible to customer, merchant, inventory, and admin', async ({
  baseURL,
  browser,
  page: customerPage,
}) => {
  test.setTimeout(120_000)
  const appURL = baseURL ?? 'http://127.0.0.1:5173'
  const openedContexts: BrowserContext[] = []

  try {
    const merchant = await newSafePage(browser, appURL, authState('merchant'))
    openedContexts.push(merchant.context)
    await completeMerchantProductLifecycle(merchant.page)

    const admin = await newSafePage(browser, appURL, authState('admin'))
    openedContexts.push(admin.context)
    await approveProduct(admin.page)

    const publicStorefront = await newSafePage(browser, appURL)
    openedContexts.push(publicStorefront.context)
    await publicStorefront.page.goto('/stores/e2e-approved-store')
    const publicProduct = publicStorefront.page
      .getByRole('link')
      .filter({ hasText: product.name })
      .first()
    await expect(publicProduct).toBeVisible()
    await expect(publicProduct.getByText(product.formattedPrice, { exact: true })).toBeVisible()
    await publicProduct.click()
    await expect(
      publicStorefront.page.getByRole('heading', { name: product.name, exact: true }),
    ).toBeVisible()
    await expect(publicStorefront.page.getByText('In stock', { exact: true })).toBeVisible()

    await customerPage.goto('/account')
    await expect(customerPage).toHaveURL('/account')
    await expect(
      customerPage.getByText(shipping.email, { exact: true }).first(),
    ).toBeVisible()

    await customerPage.goto('/stores/e2e-approved-store')
    await expect(
      customerPage.getByRole('heading', { name: /^E2E Approved Store/ }),
    ).toBeVisible()
    const customerProduct = customerPage
      .getByRole('link')
      .filter({ hasText: product.name })
      .first()
    await expect(customerProduct).toBeVisible()
    await customerProduct.click()

    await expect(customerPage).toHaveURL(/\/products\/[^/]+$/)
    await expect(
      customerPage.getByRole('heading', { name: product.name, exact: true }),
    ).toBeVisible()
    await expect(
      customerPage.getByText(product.formattedPrice, { exact: true }).first(),
    ).toBeVisible()
    await expect(customerPage.getByText('In stock', { exact: true })).toBeVisible()
    await expect(customerPage.getByText('Max. 10 per order', { exact: true })).toBeVisible()
    await expect(
      customerPage.getByRole('button', { name: 'Decrease quantity', exact: true }),
    ).toBeDisabled()
    await expect(
      customerPage.getByRole('button', { name: 'Increase quantity', exact: true }),
    ).toBeEnabled()

    await customerPage.getByRole('button', { name: 'Add to cart', exact: true }).click()
    await expect(customerPage.getByText('Added to cart', { exact: true })).toBeVisible()
    const cartLink = customerPage
      .getByRole('link', { name: 'Cart with 1 items', exact: true })
      .filter({ visible: true })
    await expect(cartLink).toBeVisible()
    await cartLink.click()

    await expect(customerPage).toHaveURL('/cart')
    await expect(customerPage.getByRole('heading', { name: 'Your cart', exact: true })).toBeVisible()
    await expect(customerPage.getByText(product.name, { exact: true })).toBeVisible()
    await expect(customerPage.getByText('Sold by E2E Approved Store', { exact: true })).toBeVisible()
    await expect(customerPage.getByText(product.formattedPrice, { exact: true }).first()).toBeVisible()
    const cartSummary = customerPage
      .getByRole('heading', { name: 'Order summary', exact: true })
      .locator('..')
    await expect(cartSummary.getByText('Subtotal', { exact: true })).toBeVisible()
    await expect(cartSummary.getByText(product.formattedPrice, { exact: true })).toHaveCount(2)
    await expect(
      customerPage.getByRole('button', { name: 'Decrease quantity', exact: true }),
    ).toBeDisabled()

    await customerPage
      .getByRole('button', { name: 'Proceed to checkout', exact: true })
      .click()
    await expect(customerPage).toHaveURL('/checkout')
    await expect(customerPage.getByRole('heading', { name: 'Checkout', exact: true })).toBeVisible()
    await expect(customerPage.locator('input[autocomplete="name"]')).toHaveValue(shipping.fullName)
    await expect(customerPage.locator('input[autocomplete="tel"]')).toHaveValue(shipping.phone)
    await expect(customerPage.locator('input[autocomplete="email"]')).toHaveValue(shipping.email)
    await customerPage.getByPlaceholder('Street address', { exact: true }).fill(shipping.line1)
    await customerPage.locator('input[autocomplete="address-level2"]').fill(shipping.city)
    await customerPage.locator('input[autocomplete="address-level1"]').fill(shipping.province)
    await customerPage.locator('input[autocomplete="postal-code"]').fill(shipping.postalCode)
    await customerPage.locator('input[autocomplete="country-name"]').fill(shipping.country)
    await customerPage
      .getByPlaceholder('Delivery notes for the courier (optional)', { exact: true })
      .fill(shipping.instructions)
    await expect(customerPage.getByText('Cash on Delivery', { exact: true })).toBeVisible()
    await expect(customerPage.getByLabel('Selected payment method')).toBeVisible()
    await expect(customerPage.getByText(product.name, { exact: true })).toBeVisible()
    await expect(customerPage.getByText(product.formattedPrice, { exact: true }).first()).toBeVisible()

    await customerPage.getByRole('button', { name: 'Place order', exact: true }).click()
    await expect(customerPage).toHaveURL('/order-success')
    await expect(
      customerPage.getByRole('heading', { name: 'Thank you for your order!', exact: true }),
    ).toBeVisible()
    await expect(
      customerPage.getByText(
        'The merchant has been notified and will start preparing your items. Pay in cash when your order arrives.',
        { exact: true },
      ),
    ).toBeVisible()

    const orderNumber = (await customerPage.getByText(/^VND-[A-Z2-9]{6}$/).textContent())?.trim()
    expect(orderNumber).toMatch(/^VND-[A-Z2-9]{6}$/)
    await expect(customerPage.getByText('Cash on delivery', { exact: true })).toBeVisible()

    await customerPage.getByRole('link', { name: 'View my orders', exact: true }).click()
    await expect(customerPage).toHaveURL('/account/orders')
    await expect(customerPage.getByRole('heading', { name: 'My account', exact: true })).toBeVisible()
    await expect(customerPage.getByRole('heading', { name: 'My orders', exact: true })).toBeVisible()
    await expect(customerPage.getByText(orderNumber!, { exact: true })).toBeVisible()
    await expect(customerPage.getByText('E2E Approved Store', { exact: false })).toBeVisible()
    await expect(customerPage.getByText('Pending', { exact: true })).toBeVisible()
    await expect(customerPage.getByText('1 item', { exact: false })).toBeVisible()
    await expect(customerPage.getByText(product.formattedPrice, { exact: true })).toBeVisible()
    await customerPage.getByRole('link', { name: 'View details', exact: true }).click()

    await expect(customerPage).toHaveURL(/\/account\/orders\/[^/]+$/)
    await expect(customerPage.getByRole('heading', { name: orderNumber!, exact: true })).toBeVisible()
    await expect(customerPage.getByText('Pending', { exact: true }).first()).toBeVisible()
    await expect(
      customerPage
        .getByText('Sold by E2E Approved Store', { exact: false })
        .filter({ visible: true })
        .first(),
    ).toBeVisible()
    await expect(
      customerPage.getByText(product.name, { exact: true }).filter({ visible: true }).first(),
    ).toBeVisible()
    await expect(customerPage.getByText('Total (COD)', { exact: true })).toBeVisible()
    await expect(customerPage.getByText('Order placed', { exact: true })).toBeVisible()

    await merchant.page.goto('/merchant/orders')
    await expect(merchant.page.getByRole('heading', { name: 'Orders', exact: true })).toBeVisible()
    const merchantOrderRow = merchant.page
      .getByRole('link')
      .filter({ hasText: orderNumber! })
      .filter({ hasText: shipping.fullName })
    await expect(merchantOrderRow).toBeVisible()
    await expect(merchantOrderRow.getByText(shipping.fullName, { exact: true })).toBeVisible()
    await expect(merchantOrderRow.getByText('1', { exact: true })).toBeVisible()
    await expect(merchantOrderRow.getByText(product.formattedPrice, { exact: true })).toBeVisible()
    await expect(merchantOrderRow.getByText('COD Due', { exact: true })).toBeVisible()
    await expect(merchantOrderRow.getByText('Pending', { exact: true })).toBeVisible()
    await merchantOrderRow.getByRole('link', { name: orderNumber!, exact: true }).click()

    await expect(merchant.page).toHaveURL(/\/merchant\/orders\/[^/]+$/)
    await expect(
      merchant.page.getByRole('heading', { name: `Order ${orderNumber}`, exact: true }),
    ).toBeVisible()
    await expect(
      merchant.page.getByText('Pending', { exact: true }).filter({ visible: true }).first(),
    ).toBeVisible()
    await expect(merchant.page.getByText('Items (1)', { exact: true })).toBeVisible()
    await expect(
      merchant.page.getByText(product.name, { exact: true }).filter({ visible: true }).first(),
    ).toBeVisible()
    await expect(
      merchant.page.getByText('Total (COD)', { exact: true }).filter({ visible: true }).first(),
    ).toBeVisible()
    await expect(
      merchant.page.getByText(shipping.email, { exact: true }).filter({ visible: true }).first(),
    ).toBeVisible()

    await merchant.page.goto('/merchant/inventory')
    await expect(merchant.page.getByRole('heading', { name: 'Inventory', exact: true })).toBeVisible()
    const inventoryRow = merchant.page.getByRole('row').filter({ hasText: product.name })
    await expect(inventoryRow).toBeVisible()
    await expect(inventoryRow.getByText('26', { exact: true })).toBeVisible()
    await expect(inventoryRow.getByText('1', { exact: true })).toBeVisible()
    await expect(inventoryRow.getByText('In stock', { exact: true })).toBeVisible()
    await expect(merchant.page.getByText('No stock movements yet', { exact: true })).toBeVisible()

    await admin.page.goto('/admin/orders')
    await expect(admin.page.getByRole('heading', { name: 'Orders', exact: true })).toBeVisible()
    const adminOrderRow = admin.page.getByRole('row').filter({ hasText: orderNumber! })
    await expect(adminOrderRow).toBeVisible()
    await expect(adminOrderRow.getByText(shipping.fullName, { exact: true })).toBeVisible()
    await expect(adminOrderRow.getByText('E2E Approved Store', { exact: true })).toBeVisible()
    await expect(adminOrderRow.getByText(product.formattedPrice, { exact: true })).toBeVisible()
    await expect(adminOrderRow.getByText('Pending', { exact: true })).toBeVisible()

    console.info(`CUSTOMER_ORDER_E2E order=${orderNumber} stock=27->26 sold=0->1`)
  } finally {
    await Promise.all(openedContexts.map((context) => context.close()))
  }
})
