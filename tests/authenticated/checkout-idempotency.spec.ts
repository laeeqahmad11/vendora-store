import { execFile } from 'node:child_process'
import path from 'node:path'
import { promisify } from 'node:util'
import type { Page, Route } from '@playwright/test'
import { expect, test } from '../fixtures'

const execFileAsync = promisify(execFile)
const projectId = 'demo-vendora-e2e'
const firestoreHost = '127.0.0.1:8080'
const firestoreRoot = `http://${firestoreHost}/v1/projects/${projectId}/databases/(default)/documents`
const ownerHeaders = { Authorization: 'Bearer owner' }
const attemptsStorageKey = 'vendora-checkout-attempts-v1'

const product = {
  id: 'e2e-discount-main',
  name: 'E2E Discount Main Product',
  slug: 'e2e-discount-main-product',
}

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

interface Attempt {
  checkoutSessionId: string
  createdAt: number
  fingerprint: string
  idempotencyKey: string
  state: 'pending' | 'completed'
  updatedAt: number
}

type FirestoreValue = {
  integerValue?: string
  stringValue?: string
}

interface EmulatorDocument {
  name: string
  fields?: Record<string, FirestoreValue>
}

function assertSafeTarget() {
  if (projectId !== 'demo-vendora-e2e' || firestoreHost !== '127.0.0.1:8080') {
    throw new Error(`Refusing unsafe Firebase target: ${projectId} at ${firestoreHost}`)
  }
}

async function emulatorFetch(url: string) {
  assertSafeTarget()
  const response = await fetch(url, { headers: ownerHeaders })

  if (!response.ok) {
    throw new Error(`Firestore emulator request failed (${response.status}): ${await response.text()}`)
  }

  return response
}

function valueOf(value: FirestoreValue | undefined): string | number | undefined {
  if (value?.stringValue !== undefined) return value.stringValue
  if (value?.integerValue !== undefined) return Number(value.integerValue)
  return undefined
}

async function collectionDocuments(collectionName: string) {
  const response = await emulatorFetch(`${firestoreRoot}/${collectionName}?pageSize=100`)
  return ((await response.json()) as { documents?: EmulatorDocument[] }).documents ?? []
}

async function customerOrders() {
  return (await collectionDocuments('orders')).filter(
    (document) => valueOf(document.fields?.customerId) === 'e2e-customer',
  )
}

async function integerDocumentField(pathname: string, field: string) {
  const response = await emulatorFetch(`${firestoreRoot}/${pathname}`)
  const document = (await response.json()) as EmulatorDocument
  const value = valueOf(document.fields?.[field])

  if (typeof value !== 'number') {
    throw new Error(`Missing integer field ${field} in ${document.name}`)
  }

  return value
}

async function resetAndSeedDiscounts() {
  await execFileAsync(process.execPath, [
    path.resolve('scripts/e2e/seed-emulators.mjs'),
    '--preserve-auth',
    '--discount-fixtures',
  ])
}

async function initializeCustomer(page: Page) {
  await page.goto('/account')
  await expect(page).toHaveURL('/account')
  await expect(page.getByText(shipping.email, { exact: true }).first()).toBeVisible()
}

async function addProductAndOpenCheckout(page: Page) {
  await page.goto(`/products/${product.slug}`)
  await expect(page.getByRole('heading', { name: product.name, exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Add to cart', exact: true }).first().click()
  await expect(page.getByText('Added to cart', { exact: true })).toBeVisible()
  await page.getByRole('link', { name: 'Cart with 1 items', exact: true }).filter({ visible: true }).click()
  await page.getByRole('button', { name: 'Proceed to checkout', exact: true }).click()
  await expect(page).toHaveURL('/checkout')
}

async function fillCheckout(page: Page, line1 = shipping.line1) {
  await expect(page.getByRole('heading', { name: 'Checkout', exact: true })).toBeVisible()
  await page.locator('input[autocomplete="name"]').fill(shipping.fullName)
  await page.locator('input[autocomplete="tel"]').fill(shipping.phone)
  await page.locator('input[autocomplete="email"]').fill(shipping.email)
  await page.getByPlaceholder('Street address', { exact: true }).fill(line1)
  await page.locator('input[autocomplete="address-level2"]').fill(shipping.city)
  await page.locator('input[autocomplete="address-level1"]').fill(shipping.province)
  await page.locator('input[autocomplete="postal-code"]').fill(shipping.postalCode)
  await page.locator('input[autocomplete="country-name"]').fill(shipping.country)
}

async function applyCoupon(page: Page) {
  await page.getByPlaceholder('Enter promo code', { exact: true }).fill('PERCENT20')
  await page.getByRole('button', { name: 'Apply', exact: true }).click()
  await expect(
    page.getByText('Promo code PERCENT20 applied successfully.', {
      exact: true,
    }),
  ).toBeVisible()
}

async function attempts(page: Page): Promise<Attempt[]> {
  return page.evaluate((key) => {
    const serialized = localStorage.getItem(key)
    if (!serialized) return []
    return (JSON.parse(serialized) as { attempts?: Attempt[] }).attempts ?? []
  }, attemptsStorageKey)
}

function idempotencyKey(route: Route): string {
  const body = route.request().postDataJSON() as {
    data?: { idempotencyKey?: unknown }
  }
  const key = body.data?.idempotencyKey

  if (typeof key !== 'string') {
    throw new Error('Callable request has no idempotency key.')
  }

  return key
}

async function captureFailedSubmission(page: Page): Promise<string> {
  let resolveKey!: (key: string) => void
  const captured = new Promise<string>((resolve) => {
    resolveKey = resolve
  })
  const handler = async (route: Route) => {
    if (route.request().method() !== 'POST') {
      await route.continue()
      return
    }

    resolveKey(idempotencyKey(route))
    await route.abort('connectionfailed')
  }

  await page.route('**/placeOrders', handler)
  await page.getByRole('button', { name: 'Place order', exact: true }).click()
  const key = await captured
  await page.unroute('**/placeOrders', handler)
  await expect(page.getByRole('button', { name: 'Place order', exact: true })).toBeEnabled()
  return key
}

test.beforeEach(resetAndSeedDiscounts)

test('reload reuses material intent, rotates changed intent, and recovers a lost committed response', async ({
  page,
}) => {
  test.setTimeout(120_000)
  await initializeCustomer(page)
  await addProductAndOpenCheckout(page)
  await applyCoupon(page)
  await fillCheckout(page)

  const originalSessionId = await page.evaluate(() => {
    const cart = JSON.parse(localStorage.getItem('vendora-cart') ?? '{}') as {
      state?: { checkoutSessionId?: string }
    }
    return cart.state?.checkoutSessionId
  })
  expect(originalSessionId).toMatch(/^[0-9a-f-]{36}$/)

  const firstKey = await captureFailedSubmission(page)
  expect(await attempts(page)).toEqual([
    expect.objectContaining({
      checkoutSessionId: originalSessionId,
      idempotencyKey: firstKey,
      state: 'pending',
    }),
  ])
  await expect(customerOrders()).resolves.toHaveLength(0)

  await page.reload()
  await fillCheckout(page)
  const reloadKey = await captureFailedSubmission(page)
  expect(reloadKey).toBe(firstKey)

  await page.reload()
  await fillCheckout(page, '28 Emulator Avenue')
  const changedIntentKey = await captureFailedSubmission(page)
  expect(changedIntentKey).not.toBe(firstKey)

  await page.reload()
  await fillCheckout(page)
  const restoredIntentKey = await captureFailedSubmission(page)
  expect(restoredIntentKey).toBe(firstKey)

  let resolveCommittedKey!: (key: string) => void
  const committedKey = new Promise<string>((resolve) => {
    resolveCommittedKey = resolve
  })
  const loseResponse = async (route: Route) => {
    if (route.request().method() !== 'POST') {
      await route.continue()
      return
    }

    resolveCommittedKey(idempotencyKey(route))
    const response = await route.fetch()
    expect(response.ok()).toBe(true)
    await route.abort('connectionfailed')
  }
  await page.route('**/placeOrders', loseResponse)
  await page.getByRole('button', { name: 'Place order', exact: true }).click()
  expect(await committedKey).toBe(firstKey)
  await page.unroute('**/placeOrders', loseResponse)

  await expect.poll(() => customerOrders()).toHaveLength(1)
  await expect.poll(() => integerDocumentField(`products/${product.id}`, 'stock')).toBe(19)
  await expect.poll(() => integerDocumentField('coupons/e2e-percent-cap', 'usedCount')).toBe(1)
  await expect.poll(async () => (await collectionDocuments('couponUsages')).length).toBe(1)

  await page.reload()
  await fillCheckout(page)
  let retryKey = ''
  page.on('request', (request) => {
    if (request.method() !== 'POST' || !request.url().endsWith('/placeOrders')) {
      return
    }
    const body = request.postDataJSON() as {
      data?: { idempotencyKey?: string }
    }
    retryKey = body.data?.idempotencyKey ?? ''
  })
  await page.getByRole('button', { name: 'Place order', exact: true }).click()
  await expect(page).toHaveURL('/order-success')
  expect(retryKey).toBe(firstKey)

  const order = (await customerOrders())[0]
  const orderNumber = valueOf(order.fields?.orderNumber)
  await expect(page.getByText(String(orderNumber), { exact: true })).toBeVisible()
  await expect(customerOrders()).resolves.toHaveLength(1)
  await expect(integerDocumentField(`products/${product.id}`, 'stock')).resolves.toBe(19)
  await expect(integerDocumentField('coupons/e2e-percent-cap', 'usedCount')).resolves.toBe(1)
  await expect(collectionDocuments('couponUsages')).resolves.toHaveLength(1)

  const retired = (await attempts(page)).find((attempt) => attempt.idempotencyKey === firstKey)
  expect(retired?.state).toBe('completed')
  const newSessionId = await page.evaluate(() => {
    const cart = JSON.parse(localStorage.getItem('vendora-cart') ?? '{}') as {
      state?: { checkoutSessionId?: string }
    }
    return cart.state?.checkoutSessionId
  })
  expect(newSessionId).not.toBe(originalSessionId)

  await page.reload()
  await expect(page).toHaveURL('/order-success')
  await page.goto('/cart')
  await expect(page.getByRole('heading', { name: 'Your cart is empty', exact: true })).toBeVisible()

  await addProductAndOpenCheckout(page)
  await applyCoupon(page)
  await fillCheckout(page)
  const nextCheckoutKey = await captureFailedSubmission(page)
  expect(nextCheckoutKey).not.toBe(firstKey)
  await expect(customerOrders()).resolves.toHaveLength(1)

  console.info(
    `CHECKOUT_DURABLE_IDEMPOTENCY key=${firstKey} reloadReuse=true ` +
      `changedIntentRotated=true recoveredOrder=${String(orderNumber)} ` +
      'orders=1 stock=20->19 couponUsed=0->1 couponUsages=1 retired=true ' +
      'newCheckoutFreshKey=true',
  )
})

test('two tabs submit one shared checkout attempt', async ({ page }) => {
  test.setTimeout(120_000)
  await initializeCustomer(page)
  await addProductAndOpenCheckout(page)
  await applyCoupon(page)
  await fillCheckout(page)

  const secondPage = await page.context().newPage()
  await secondPage.goto('/checkout')
  await fillCheckout(secondPage)

  const submittedKeys: string[] = []
  for (const currentPage of [page, secondPage]) {
    currentPage.on('request', (request) => {
      if (request.method() !== 'POST' || !request.url().endsWith('/placeOrders')) {
        return
      }
      const body = request.postDataJSON() as {
        data?: { idempotencyKey?: string }
      }
      if (body.data?.idempotencyKey) {
        submittedKeys.push(body.data.idempotencyKey)
      }
    })
  }

  await Promise.all([
    page.getByRole('button', { name: 'Place order', exact: true }).click(),
    secondPage.getByRole('button', { name: 'Place order', exact: true }).click(),
  ])
  await expect(page).toHaveURL('/order-success')
  await expect(secondPage).toHaveURL('/order-success')
  expect(submittedKeys).toHaveLength(2)
  expect(new Set(submittedKeys).size).toBe(1)
  await expect(customerOrders()).resolves.toHaveLength(1)
  await expect(integerDocumentField(`products/${product.id}`, 'stock')).resolves.toBe(19)
  await expect(integerDocumentField('coupons/e2e-percent-cap', 'usedCount')).resolves.toBe(1)
  await expect(collectionDocuments('couponUsages')).resolves.toHaveLength(1)

  console.info(
    `CHECKOUT_MULTI_TAB_IDEMPOTENCY key=${submittedKeys[0]} tabs=2 ` +
      'orders=1 stock=20->19 couponUsed=0->1 couponUsages=1',
  )
})
