import { execFile } from 'node:child_process'
import path from 'node:path'
import { promisify } from 'node:util'
import type { Page } from '@playwright/test'
import { expect, test } from '../fixtures'

const execFileAsync = promisify(execFile)
const projectId = 'demo-vendora-e2e'
const firestoreHost = '127.0.0.1:8080'
const firestoreRoot = `http://${firestoreHost}/v1/projects/${projectId}/databases/(default)/documents`
const ownerHeaders = { Authorization: 'Bearer owner' }

const products = {
  main: { id: 'e2e-discount-main', name: 'E2E Discount Main Product', slug: 'e2e-discount-main-product' },
  small: { id: 'e2e-discount-small', name: 'E2E Discount Small Product', slug: 'e2e-discount-small-product' },
  foreign: { id: 'e2e-discount-foreign', name: 'E2E Discount Foreign Product', slug: 'e2e-discount-foreign-product' },
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

type FirestoreValue = {
  stringValue?: string
  integerValue?: string
  doubleValue?: number
  booleanValue?: boolean
  arrayValue?: { values?: FirestoreValue[] }
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

async function emulatorFetch(url: string, init?: RequestInit) {
  assertSafeTarget()
  const response = await fetch(url, {
    ...init,
    headers: { ...ownerHeaders, ...init?.headers },
  })
  if (!response.ok) {
    throw new Error(`Firestore emulator request failed (${response.status}): ${await response.text()}`)
  }
  return response
}

function valueOf(value: FirestoreValue | undefined): unknown {
  if (!value) return undefined
  if (value.stringValue !== undefined) return value.stringValue
  if (value.integerValue !== undefined) return Number(value.integerValue)
  if (value.doubleValue !== undefined) return value.doubleValue
  if (value.booleanValue !== undefined) return value.booleanValue
  if (value.arrayValue !== undefined) return (value.arrayValue.values ?? []).map(valueOf)
  return undefined
}

function fieldsOf(document: EmulatorDocument) {
  return Object.fromEntries(
    Object.entries(document.fields ?? {}).map(([key, value]) => [key, valueOf(value)]),
  )
}

async function collectionDocuments(collectionName: string) {
  const response = await emulatorFetch(`${firestoreRoot}/${collectionName}?pageSize=100`)
  return ((await response.json()) as { documents?: EmulatorDocument[] }).documents ?? []
}

async function customerOrders() {
  return (await collectionDocuments('orders'))
    .map(fieldsOf)
    .filter((fields) => fields.customerId === 'e2e-customer')
}

async function documentFields(pathname: string) {
  return fieldsOf((await (await emulatorFetch(`${firestoreRoot}/${pathname}`)).json()) as EmulatorDocument)
}

async function patchBoolean(pathname: string, field: string, value: boolean) {
  await emulatorFetch(`${firestoreRoot}/${pathname}?updateMask.fieldPaths=${field}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: { [field]: { booleanValue: value } } }),
  })
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

async function addProduct(page: Page, product: (typeof products)[keyof typeof products]) {
  await page.goto(`/products/${product.slug}`)
  await expect(page.getByRole('heading', { name: product.name, exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Add to cart', exact: true }).first().click()
  await expect(page.getByText('Added to cart', { exact: true })).toBeVisible()
}

async function openCheckout(page: Page, itemCount: number) {
  await page
    .getByRole('link', { name: `Cart with ${itemCount} items`, exact: true })
    .filter({ visible: true })
    .click()
  await expect(page).toHaveURL('/cart')
  await page.getByRole('button', { name: 'Proceed to checkout', exact: true }).click()
  await expect(page).toHaveURL('/checkout')
  await expect(page.getByRole('heading', { name: 'Checkout', exact: true })).toBeVisible()
}

async function applyCoupon(page: Page, code: string) {
  await page.getByPlaceholder('Enter promo code', { exact: true }).fill(code)
  await page.getByRole('button', { name: 'Apply', exact: true }).click()
}

async function fillCheckout(page: Page) {
  await page.locator('input[autocomplete="name"]').fill(shipping.fullName)
  await page.locator('input[autocomplete="tel"]').fill(shipping.phone)
  await page.locator('input[autocomplete="email"]').fill(shipping.email)
  await page.getByPlaceholder('Street address', { exact: true }).fill(shipping.line1)
  await page.locator('input[autocomplete="address-level2"]').fill(shipping.city)
  await page.locator('input[autocomplete="address-level1"]').fill(shipping.province)
  await page.locator('input[autocomplete="postal-code"]').fill(shipping.postalCode)
  await page.locator('input[autocomplete="country-name"]').fill(shipping.country)
}

async function placeOrder(page: Page) {
  await fillCheckout(page)
  await page.getByRole('button', { name: 'Place order', exact: true }).click()
  await expect(page).toHaveURL('/order-success')
  await expect(page.getByRole('heading', { name: 'Thank you for your order!', exact: true })).toBeVisible()
}

test.beforeEach(resetAndSeedDiscounts)

test('percentage coupon applies the exact cap and persists one atomic redemption', async ({ page }) => {
  await initializeCustomer(page)
  await addProduct(page, products.main)
  await openCheckout(page, 1)
  await applyCoupon(page, 'percent20')
  await expect(page.getByText('Promo code PERCENT20 applied successfully.', { exact: true })).toBeVisible()
  const summary = page.getByText('Order summary', { exact: true }).locator('..')
  await expect(summary).toContainText('$30.00')
  await expect(summary).toContainText('$170.00')
  await placeOrder(page)

  const orders = await customerOrders()
  expect(orders).toHaveLength(1)
  expect(orders[0]).toMatchObject({
    subtotal: 200,
    discount: 30,
    total: 170,
    couponId: 'e2e-percent-cap',
    couponCode: 'PERCENT20',
  })
  expect((await documentFields('coupons/e2e-percent-cap')).usedCount).toBe(1)
  expect((await collectionDocuments('couponUsages')).map(fieldsOf)).toHaveLength(1)
  expect((await documentFields('customerCouponUsages/e2e-percent-cap_e2e-customer')).count).toBe(1)
})

test('invalid, inactive, expired, future, and below-minimum coupons are rejected', async ({ page }) => {
  await initializeCustomer(page)
  await addProduct(page, products.small)
  await openCheckout(page, 1)

  for (const [code, message] of [
    ['DOESNOTEXIST', 'This promo code is not valid.'],
    ['INACTIVE10', 'This promo code is not valid.'],
    ['EXPIRED10', 'This promo code has expired.'],
    ['FUTURE10', 'This promo code is not active yet.'],
    ['MINIMUM10', 'This code requires a minimum order of 100.00.'],
  ] as const) {
    await applyCoupon(page, code)
    await expect(page.getByText(message, { exact: true })).toBeVisible()
  }

  await expect(customerOrders()).resolves.toHaveLength(0)
})

test('fixed discount is capped at the eligible subtotal and never produces a negative total', async ({ page }) => {
  await initializeCustomer(page)
  await addProduct(page, products.small)
  await openCheckout(page, 1)
  await applyCoupon(page, 'FIXED150')
  await expect(page.getByText('Promo code FIXED150 applied successfully.', { exact: true })).toBeVisible()
  const summary = page.getByText('Order summary', { exact: true }).locator('..')
  await expect(summary).toContainText('$40.00')
  await expect(summary).toContainText('$0.00')
  await placeOrder(page)
  expect(await customerOrders()).toEqual([
    expect.objectContaining({ subtotal: 40, discount: 40, total: 0, couponCode: 'FIXED150' }),
  ])
})

test('store coupon discounts only its store in a multi-store cart', async ({ page }) => {
  await initializeCustomer(page)
  await addProduct(page, products.main)
  await addProduct(page, products.foreign)
  await openCheckout(page, 2)
  await expect(page.getByText(/items come from 2 stores/)).toBeVisible()
  await applyCoupon(page, 'STORE25')
  await expect(page.getByText('Promo code STORE25 applied successfully.', { exact: true })).toBeVisible()
  await placeOrder(page)

  const orders = (await customerOrders()).sort((a, b) => String(a.storeId).localeCompare(String(b.storeId)))
  expect(orders).toHaveLength(2)
  expect(orders.find((order) => order.storeId === 'e2e-approved-store')).toMatchObject({
    subtotal: 200,
    discount: 25,
    total: 175,
    couponCode: 'STORE25',
  })
  expect(orders.find((order) => order.storeId === 'e2e-discount-foreign-store')).toMatchObject({
    subtotal: 80,
    discount: 0,
    total: 80,
  })
  expect(orders.find((order) => order.storeId === 'e2e-discount-foreign-store')).not.toHaveProperty('couponCode')
})

test('platform coupon is redeemed once and allocated exactly across split store orders', async ({ page }) => {
  await initializeCustomer(page)
  await addProduct(page, products.main)
  await addProduct(page, products.foreign)
  await openCheckout(page, 2)
  await applyCoupon(page, 'PERCENT20')
  await expect(page.getByText('Promo code PERCENT20 applied successfully.', { exact: true })).toBeVisible()
  await placeOrder(page)

  const orders = await customerOrders()
  expect(orders).toHaveLength(2)
  expect(orders.find((order) => order.storeId === 'e2e-approved-store')).toMatchObject({
    subtotal: 200,
    discount: 21.43,
    total: 178.57,
    couponBasis: 280,
    couponCode: 'PERCENT20',
  })
  expect(orders.find((order) => order.storeId === 'e2e-discount-foreign-store')).toMatchObject({
    subtotal: 80,
    discount: 8.57,
    total: 71.43,
    couponBasis: 280,
    couponCode: 'PERCENT20',
  })
  expect(orders.reduce((sum, order) => sum + Number(order.discount), 0)).toBe(30)
  expect((await documentFields('coupons/e2e-percent-cap')).usedCount).toBe(1)
  expect(await collectionDocuments('couponUsages')).toHaveLength(1)
})

test('global and per-customer limits reject duplicate redemption', async ({ page }) => {
  await initializeCustomer(page)
  await addProduct(page, products.main)
  await openCheckout(page, 1)
  await applyCoupon(page, 'LIMITONE')
  await placeOrder(page)

  await addProduct(page, products.main)
  await openCheckout(page, 1)
  await applyCoupon(page, 'LIMITONE')
  await expect(page.getByText('This promo code has reached its usage limit.', { exact: true })).toBeVisible()

  await applyCoupon(page, 'CUSTOMERONE')
  await placeOrder(page)
  await addProduct(page, products.main)
  await openCheckout(page, 1)
  await applyCoupon(page, 'CUSTOMERONE')
  await expect(
    page.getByText('You have already reached the usage limit for this promo code.', { exact: true }),
  ).toBeVisible()
  expect(await customerOrders()).toHaveLength(2)
})

test('checkout rejects a coupon disabled after apply without creating an order or usage', async ({ page }) => {
  await initializeCustomer(page)
  await addProduct(page, products.main)
  await openCheckout(page, 1)
  await applyCoupon(page, 'STALE20')
  await expect(page.getByText('Promo code STALE20 applied successfully.', { exact: true })).toBeVisible()
  await patchBoolean('coupons/e2e-stale', 'active', false)
  await fillCheckout(page)
  await page.getByRole('button', { name: 'Place order', exact: true }).click()
  await expect(page).toHaveURL('/checkout')
  await expect(page.getByText('This promo code is not valid.', { exact: true })).toBeVisible()
  await expect(customerOrders()).resolves.toHaveLength(0)
  expect((await documentFields('coupons/e2e-stale')).usedCount).toBe(0)
  expect(await collectionDocuments('couponUsages')).toHaveLength(0)
  expect((await documentFields(`products/${products.main.id}`)).stock).toBe(20)
})
