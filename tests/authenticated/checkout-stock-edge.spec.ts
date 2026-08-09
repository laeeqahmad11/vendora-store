import { execFile } from 'node:child_process'
import path from 'node:path'
import { promisify } from 'node:util'
import type { Browser, BrowserContext, Page } from '@playwright/test'
import { expect, installNetworkPolicy, test } from '../fixtures'

const execFileAsync = promisify(execFile)
const projectId = 'demo-vendora-e2e'
const firestoreHost = '127.0.0.1:8080'
const firestoreRoot = `http://${firestoreHost}/v1/projects/${projectId}/databases/(default)/documents`
const emulatorHeaders = { Authorization: 'Bearer owner' }

const products = {
  outOfStock: {
    id: 'e2e-checkout-out-of-stock',
    name: 'E2E Checkout Out of Stock',
    slug: 'e2e-checkout-out-of-stock',
  },
  limited: {
    id: 'e2e-checkout-limited-stock',
    name: 'E2E Checkout Limited Stock',
    slug: 'e2e-checkout-limited-stock',
  },
  lastUnit: {
    id: 'e2e-checkout-last-unit',
    name: 'E2E Checkout Last Unit',
    slug: 'e2e-checkout-last-unit',
    formattedPrice: '$1,300.00',
  },
  staleCart: {
    id: 'e2e-checkout-stale-cart',
    name: 'E2E Checkout Stale Cart',
    slug: 'e2e-checkout-stale-cart',
  },
} as const

const shipping = {
  fullName: 'E2E Customer',
  phone: '03001234567',
  email: 'customer@e2e.vendora.test',
  line1: '27 Emulator Avenue',
  city: 'Lahore',
  province: 'Punjab',
  postalCode: '54000',
  country: 'Pakistan',
} as const

const authState = (role: 'merchant' | 'admin') => path.resolve('tests', '.auth', `${role}.json`)

interface EmulatorDocument {
  name: string
  fields?: Record<string, { integerValue?: string; stringValue?: string }>
}

function assertSafeEmulatorTarget() {
  if (!projectId.startsWith('demo-') || firestoreHost !== '127.0.0.1:8080') {
    throw new Error(`Refusing unsafe Firebase target: ${projectId} at ${firestoreHost}`)
  }
}

async function emulatorFetch(url: string, init?: RequestInit) {
  assertSafeEmulatorTarget()
  const response = await fetch(url, {
    ...init,
    headers: {
      ...emulatorHeaders,
      ...init?.headers,
    },
  })

  if (!response.ok) {
    throw new Error(`Firestore emulator request failed (${response.status}): ${await response.text()}`)
  }

  return response
}

function integerField(document: EmulatorDocument, field: string): number {
  const value = document.fields?.[field]?.integerValue
  if (value === undefined) throw new Error(`Missing integer field ${field} in ${document.name}`)
  return Number(value)
}

async function productState(productId: string) {
  const response = await emulatorFetch(`${firestoreRoot}/products/${productId}`)
  const document = (await response.json()) as EmulatorDocument
  return {
    stock: integerField(document, 'stock'),
    sold: integerField(document, 'soldCount'),
  }
}

async function customerOrders(): Promise<EmulatorDocument[]> {
  const response = await emulatorFetch(`${firestoreRoot}/orders?pageSize=100`)
  const payload = (await response.json()) as { documents?: EmulatorDocument[] }
  return (payload.documents ?? []).filter(
    (document) => document.fields?.customerId?.stringValue === 'e2e-customer',
  )
}

async function setProductStock(productId: string, stock: number) {
  await emulatorFetch(`${firestoreRoot}/products/${productId}?updateMask.fieldPaths=stock`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: { stock: { integerValue: String(stock) } } }),
  })
}

async function resetAndSeedCheckoutProducts() {
  await execFileAsync(process.execPath, [
    path.resolve('scripts/e2e/seed-emulators.mjs'),
    '--preserve-auth',
    '--checkout-stock-products',
  ])
}

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

async function initializeCustomer(page: Page) {
  await page.goto('/account')
  await expect(page).toHaveURL('/account')
  await expect(page.getByRole('heading', { name: 'My account', exact: true })).toBeVisible()
  await expect(page.getByText(shipping.email, { exact: true }).first()).toBeVisible()
}

async function openProduct(page: Page, product: { name: string; slug: string }) {
  await page.goto(`/products/${product.slug}`)
  await expect(page).toHaveURL(`/products/${product.slug}`)
  await expect(page.getByRole('heading', { name: product.name, exact: true })).toBeVisible()
}

function detailAddButton(page: Page) {
  return page.getByRole('button', { name: 'Add to cart', exact: true }).first()
}

function quantityText(page: Page) {
  return page
    .getByRole('button', { name: 'Increase quantity', exact: true })
    .locator('xpath=preceding-sibling::span[1]')
}

async function fillCheckout(page: Page) {
  await expect(page.getByRole('heading', { name: 'Checkout', exact: true })).toBeVisible()
  await page.locator('input[autocomplete="name"]').fill(shipping.fullName)
  await page.locator('input[autocomplete="tel"]').fill(shipping.phone)
  await page.locator('input[autocomplete="email"]').fill(shipping.email)
  await page.getByPlaceholder('Street address', { exact: true }).fill(shipping.line1)
  await page.locator('input[autocomplete="address-level2"]').fill(shipping.city)
  await page.locator('input[autocomplete="address-level1"]').fill(shipping.province)
  await page.locator('input[autocomplete="postal-code"]').fill(shipping.postalCode)
  await page.locator('input[autocomplete="country-name"]').fill(shipping.country)
}

async function addSingleItemAndOpenCart(page: Page, product: { name: string; slug: string }) {
  await openProduct(page, product)
  await detailAddButton(page).click()
  await expect(page.getByText('Added to cart', { exact: true })).toBeVisible()
  await page.getByRole('link', { name: 'Cart with 1 items', exact: true }).filter({ visible: true }).click()
  await expect(page).toHaveURL('/cart')
  await expect(page.getByText(product.name, { exact: true })).toBeVisible()
}

test.beforeEach(resetAndSeedCheckoutProducts)

test('out-of-stock product is public but cannot enter checkout or create an order', async ({
  baseURL,
  browser,
  page: customerPage,
}) => {
  const appURL = baseURL ?? 'http://127.0.0.1:5173'
  const publicShop = await newSafePage(browser, appURL)

  try {
    await publicShop.page.goto('/stores/e2e-approved-store')
    const productCard = publicShop.page
      .getByRole('link')
      .filter({ hasText: products.outOfStock.name })
      .first()
    await expect(productCard).toBeVisible()
    await expect(productCard.getByText('Out of stock', { exact: true })).toBeVisible()
    await productCard.click()

    await expect(
      publicShop.page.getByRole('heading', { name: products.outOfStock.name, exact: true }),
    ).toBeVisible()
    await expect(publicShop.page.getByText('Out of stock', { exact: true }).first()).toBeVisible()
    await expect(detailAddButton(publicShop.page)).toBeDisabled()
    await expect(publicShop.page.getByRole('button', { name: 'Buy now', exact: true })).toBeDisabled()
    await expect(
      publicShop.page.getByRole('button', { name: 'Increase quantity', exact: true }),
    ).toBeDisabled()

    await initializeCustomer(customerPage)
    await openProduct(customerPage, products.outOfStock)
    await expect(detailAddButton(customerPage)).toBeDisabled()
    await expect(customerPage.getByRole('button', { name: 'Buy now', exact: true })).toBeDisabled()
    await expect(customerOrders()).resolves.toHaveLength(0)
    await expect(productState(products.outOfStock.id)).resolves.toEqual({ stock: 0, sold: 0 })

    console.info('CHECKOUT_OUT_OF_STOCK_E2E stock=0->0 sold=0->0 orders=0')
  } finally {
    await publicShop.context.close()
  }
})

test('product and cart quantity controls cap quantity at live product availability', async ({ page }) => {
  await initializeCustomer(page)
  await openProduct(page, products.limited)

  const increase = page.getByRole('button', { name: 'Increase quantity', exact: true })
  await expect(quantityText(page)).toHaveText('1')
  await increase.click()
  await expect(quantityText(page)).toHaveText('2')
  await expect(increase).toBeDisabled()

  await detailAddButton(page).click()
  await expect(page.getByText('Added to cart', { exact: true })).toBeVisible()
  await detailAddButton(page).click()
  await page.getByRole('link', { name: 'Cart with 2 items', exact: true }).filter({ visible: true }).click()

  await expect(page).toHaveURL('/cart')
  await expect(quantityText(page)).toHaveText('2')
  await expect(page.getByRole('button', { name: 'Increase quantity', exact: true })).toBeDisabled()
  await page
    .getByRole('button', {
      name: `Remove ${products.limited.name} from cart`,
      exact: true,
    })
    .click()
  await expect(page.getByText('Removed from cart', { exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Your cart is empty', exact: true })).toBeVisible()

  await expect(customerOrders()).resolves.toHaveLength(0)
  await expect(productState(products.limited.id)).resolves.toEqual({ stock: 2, sold: 0 })

  console.info('CHECKOUT_LIMITED_STOCK_E2E requested=3 capped=2 removed=true stock=2->2 sold=0->0')
})

test('last unit checkout is exact-once across cart, success reloads, and every role', async ({
  baseURL,
  browser,
  page: customerPage,
}) => {
  test.setTimeout(120_000)
  const appURL = baseURL ?? 'http://127.0.0.1:5173'
  const openedContexts: BrowserContext[] = []

  try {
    await initializeCustomer(customerPage)
    await addSingleItemAndOpenCart(customerPage, products.lastUnit)
    await expect(quantityText(customerPage)).toHaveText('1')
    await expect(customerPage.getByRole('button', { name: 'Increase quantity', exact: true })).toBeDisabled()

    await customerPage.getByRole('button', { name: 'Proceed to checkout', exact: true }).click()
    await fillCheckout(customerPage)
    await customerPage.getByRole('button', { name: 'Place order', exact: true }).dblclick({
      delay: 50,
    })

    await expect(customerPage).toHaveURL('/order-success')
    await expect(
      customerPage.getByRole('heading', { name: 'Thank you for your order!', exact: true }),
    ).toBeVisible()
    const orderNumber = (await customerPage.getByText(/^VND-[A-Z2-9]{6}$/).textContent())?.trim()
    expect(orderNumber).toMatch(/^VND-[A-Z2-9]{6}$/)

    await expect.poll(() => customerOrders()).toHaveLength(1)
    await expect.poll(() => productState(products.lastUnit.id)).toEqual({ stock: 0, sold: 1 })

    await customerPage.reload()
    await expect(
      customerPage.getByRole('heading', { name: 'Thank you for your order!', exact: true }),
    ).toBeVisible()
    await expect(customerPage.getByText(orderNumber!, { exact: true })).toBeVisible()
    await expect(customerOrders()).resolves.toHaveLength(1)
    await expect(productState(products.lastUnit.id)).resolves.toEqual({ stock: 0, sold: 1 })

    await customerPage.goto('/order-success')
    await expect(
      customerPage.getByRole('heading', { name: 'Thank you for your order!', exact: true }),
    ).toBeVisible()
    await expect(customerPage.getByText(orderNumber!, { exact: true })).toBeVisible()
    await expect(customerOrders()).resolves.toHaveLength(1)

    await customerPage.goto('/cart')
    await expect(customerPage.getByRole('heading', { name: 'Your cart is empty', exact: true })).toBeVisible()
    await openProduct(customerPage, products.lastUnit)
    await expect(customerPage.getByText('Out of stock', { exact: true }).first()).toBeVisible()
    await expect(detailAddButton(customerPage)).toBeDisabled()

    await customerPage.goto('/account/orders')
    await expect(customerPage.getByText(orderNumber!, { exact: true })).toBeVisible()
    await expect(customerPage.getByText(products.lastUnit.formattedPrice, { exact: true })).toBeVisible()

    const merchant = await newSafePage(browser, appURL, authState('merchant'))
    openedContexts.push(merchant.context)
    await merchant.page.goto('/merchant/orders')
    const merchantOrder = merchant.page
      .getByRole('link')
      .filter({ hasText: orderNumber! })
      .filter({ hasText: shipping.fullName })
    await expect(merchantOrder).toBeVisible()
    await expect(merchantOrder.getByText('1', { exact: true })).toBeVisible()
    await merchant.page.goto('/merchant/inventory')
    const inventoryRow = merchant.page.getByRole('row').filter({ hasText: products.lastUnit.name })
    const inventoryCells = inventoryRow.getByRole('cell')
    await expect(inventoryRow).toBeVisible()
    await expect(inventoryCells.nth(2).getByText('0', { exact: true })).toBeVisible()
    await expect(inventoryCells.nth(3).getByText('Out of stock', { exact: true })).toBeVisible()
    await expect(inventoryCells.nth(5)).toHaveText('1')

    const admin = await newSafePage(browser, appURL, authState('admin'))
    openedContexts.push(admin.context)
    await admin.page.goto('/admin/orders')
    const adminOrder = admin.page.getByRole('row').filter({ hasText: orderNumber! })
    await expect(adminOrder).toBeVisible()
    await expect(adminOrder.getByText('E2E Approved Store', { exact: true })).toBeVisible()
    await expect(adminOrder.getByText(products.lastUnit.formattedPrice, { exact: true })).toBeVisible()

    await customerPage.reload()
    await expect(customerOrders()).resolves.toHaveLength(1)
    await expect(productState(products.lastUnit.id)).resolves.toEqual({ stock: 0, sold: 1 })

    console.info(
      `CHECKOUT_LAST_UNIT_E2E order=${orderNumber} orders=0->1 stock=1->0 sold=0->1 ` +
        'doubleClick=true successReload=true directRevisit=true cartCleared=true roles=customer,merchant,admin',
    )
  } finally {
    await Promise.all(openedContexts.map((context) => context.close()))
  }
})

test('stale cart cannot create an order after stock becomes unavailable', async ({ page }) => {
  test.setTimeout(90_000)
  await initializeCustomer(page)
  await addSingleItemAndOpenCart(page, products.staleCart)

  await setProductStock(products.staleCart.id, 0)
  await expect.poll(() => productState(products.staleCart.id)).toEqual({ stock: 0, sold: 0 })

  await page.reload()
  await expect(page.getByText(products.staleCart.name, { exact: true })).toBeVisible()
  await expect(quantityText(page)).toHaveText('1')
  await page.getByRole('button', { name: 'Proceed to checkout', exact: true }).click()
  await fillCheckout(page)
  await page.getByRole('button', { name: 'Place order', exact: true }).click()

  await expect.soft(page).toHaveURL('/checkout', { timeout: 3_000 })
  await expect
    .soft(page.getByText(/unavailable|out of stock|stock changed/i).first())
    .toBeVisible({ timeout: 3_000 })
  await expect.soft(customerOrders()).resolves.toHaveLength(0)
  await expect(productState(products.staleCart.id)).resolves.toEqual({ stock: 0, sold: 0 })

  const actualOrders = await customerOrders()
  console.info(
    `CHECKOUT_STALE_CART_E2E checkoutUrl=${page.url()} orders=${actualOrders.length} ` +
      'stock=1->0 sold=0->0',
  )
})

test('multi-item checkout is atomic when one product becomes unavailable', async ({ page }) => {
  test.setTimeout(90_000)
  await initializeCustomer(page)

  await openProduct(page, products.limited)
  await detailAddButton(page).click()
  await expect(page.getByText('Added to cart', { exact: true })).toBeVisible()

  await openProduct(page, products.staleCart)
  await detailAddButton(page).click()
  await expect(page.getByText('Added to cart', { exact: true })).toBeVisible()
  await page.getByRole('link', { name: 'Cart with 2 items', exact: true }).filter({ visible: true }).click()

  await expect(page).toHaveURL('/cart')
  await expect(page.getByText(products.limited.name, { exact: true }).first()).toBeVisible()
  await expect(page.getByText(products.staleCart.name, { exact: true }).first()).toBeVisible()

  await setProductStock(products.staleCart.id, 0)
  await expect.poll(() => productState(products.staleCart.id)).toEqual({ stock: 0, sold: 0 })

  await page.getByRole('button', { name: 'Proceed to checkout', exact: true }).click()
  await fillCheckout(page)
  await page.getByRole('button', { name: 'Place order', exact: true }).click()

  await expect(page).toHaveURL('/checkout')
  await expect(page.getByText(/unavailable|out of stock|stock changed/i).first()).toBeVisible()
  await expect(customerOrders()).resolves.toHaveLength(0)
  await expect(productState(products.limited.id)).resolves.toEqual({ stock: 2, sold: 0 })
  await expect(productState(products.staleCart.id)).resolves.toEqual({ stock: 0, sold: 0 })

  console.info(
    'CHECKOUT_MULTI_ITEM_ATOMIC_E2E orders=0 availableStock=2->2 availableSold=0->0 ' +
      'unavailableStock=1->0 unavailableSold=0->0',
  )
})
