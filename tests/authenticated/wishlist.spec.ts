import { execFile } from 'node:child_process'
import path from 'node:path'
import { promisify } from 'node:util'
import type { Locator, Page } from '@playwright/test'
import { expect, test } from '../fixtures'

const execFileAsync = promisify(execFile)
const wishlistKey = 'vendora-wishlist'
const cartKey = 'vendora-cart'
const customer = {
  email: 'customer@e2e.vendora.test',
  password: 'VendoraE2E!123',
} as const
const products = {
  available: {
    id: 'e2e-checkout-limited-stock',
    name: 'E2E Checkout Limited Stock',
    slug: 'e2e-checkout-limited-stock',
  },
  outOfStock: {
    id: 'e2e-checkout-out-of-stock',
    name: 'E2E Checkout Out of Stock',
    slug: 'e2e-checkout-out-of-stock',
  },
} as const

async function resetAndSeedWishlistProducts() {
  await execFileAsync(process.execPath, [
    path.resolve('scripts/e2e/seed-emulators.mjs'),
    '--preserve-auth',
    '--checkout-stock-products',
  ])
}

async function resetLocalShoppingState(page: Page) {
  await page.goto('/')
  await page.evaluate(
    ([wishlist, cart]) => {
      localStorage.removeItem(wishlist)
      localStorage.removeItem(cart)
    },
    [wishlistKey, cartKey],
  )
  await page.reload()
}

async function wishlistIds(page: Page): Promise<string[]> {
  return page.evaluate((key) => {
    const stored = localStorage.getItem(key)
    if (!stored) return []
    const parsed = JSON.parse(stored) as { state?: { productIds?: unknown } }
    return Array.isArray(parsed.state?.productIds)
      ? parsed.state.productIds.filter((id): id is string => typeof id === 'string')
      : []
  }, wishlistKey)
}

function visibleAccountMenu(page: Page) {
  return page.getByRole('button', { name: 'Open account menu', exact: true }).filter({ visible: true })
}

async function signOut(page: Page) {
  await visibleAccountMenu(page).click()
  await page.getByRole('menuitem', { name: 'Sign out', exact: true }).click()
  await expect(page.getByText('Signed out', { exact: true })).toBeVisible()
  await expect(
    page.getByRole('link', { name: 'Sign in', exact: true }).filter({ visible: true }),
  ).toBeVisible()
}

async function signIn(page: Page) {
  await page.locator('input[type="email"]').fill(customer.email)
  await page.locator('input[type="password"]').fill(customer.password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByText('Welcome back, E2E Customer!', { exact: true })).toBeVisible()
}

async function openProduct(page: Page, product: (typeof products)[keyof typeof products]) {
  await page.goto(`/products/${product.slug}`)
  await expect(page).toHaveURL(`/products/${product.slug}`)
  await expect(page.getByRole('heading', { name: product.name, exact: true })).toBeVisible()
}

function productCard(page: Page, name: string): Locator {
  return page.getByRole('link').filter({ hasText: name }).first()
}

function wishlistHeading(page: Page, count: number) {
  return page.getByRole('heading', { name: `My wishlist (${count})`, exact: true })
}

test.beforeEach(resetAndSeedWishlistProducts)

test('wishlist is shared across public surfaces, persists locally, and safely moves available stock to cart', async ({
  page,
}) => {
  test.setTimeout(90_000)

  await page.goto('/account')
  await expect(page.getByRole('heading', { name: 'My account', exact: true })).toBeVisible()
  await resetLocalShoppingState(page)
  await signOut(page)

  await page.goto('/stores/e2e-approved-store')
  const availableCard = productCard(page, products.available.name)
  await expect(availableCard).toBeVisible()
  await availableCard.click()
  await expect(page.getByRole('heading', { name: products.available.name, exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'Add to wishlist', exact: true }).click()
  await expect(page.getByText('Added to wishlist', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Remove from wishlist', exact: true })).toBeVisible()
  await expect.poll(() => wishlistIds(page)).toEqual([products.available.id])

  await page.reload()
  await expect(page.getByRole('button', { name: 'Remove from wishlist', exact: true })).toBeVisible()
  await expect.poll(() => wishlistIds(page)).toEqual([products.available.id])

  await page.getByRole('link', { name: 'Shop', exact: true }).filter({ visible: true }).click()
  await expect(page).toHaveURL('/shop')
  await page.goBack()
  await expect(page).toHaveURL(`/products/${products.available.slug}`)
  await expect(page.getByRole('button', { name: 'Remove from wishlist', exact: true })).toBeVisible()

  await page.goto('/account/wishlist')
  await expect(page).toHaveURL('/auth/login')
  await signIn(page)
  await expect(page).toHaveURL('/account/wishlist')
  await expect(wishlistHeading(page, 1)).toBeVisible()
  await expect(page.getByText(products.available.name, { exact: true })).toBeVisible()
  await expect.poll(() => wishlistIds(page)).toEqual([products.available.id])

  // A saved product exposes a remove action, not another add action. The
  // persisted ID array and account count therefore stay singular across UI.
  await page.reload()
  await expect(wishlistHeading(page, 1)).toBeVisible()
  await expect.poll(() => wishlistIds(page)).toEqual([products.available.id])

  await page
    .getByRole('button', { name: `Remove ${products.available.name} from wishlist`, exact: true })
    .click()
  await expect(page.getByText('Removed from wishlist', { exact: true })).toBeVisible()
  await expect(wishlistHeading(page, 0)).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Your wishlist is empty', exact: true })).toBeVisible()

  await openProduct(page, products.available)
  await expect(page.getByRole('button', { name: 'Add to wishlist', exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('button', { name: 'Add to wishlist', exact: true })).toBeVisible()
  await expect.poll(() => wishlistIds(page)).toEqual([])

  await page.goto('/stores/e2e-approved-store')
  const cardToggle = productCard(page, products.available.name).getByRole('button', {
    name: 'Toggle wishlist',
    exact: true,
  })
  await cardToggle.click()
  await expect(page.getByText('Added to wishlist', { exact: true })).toBeVisible()
  await expect(cardToggle.locator('svg')).toHaveClass(/fill-red-500/)
  await expect.poll(() => wishlistIds(page)).toEqual([products.available.id])

  await openProduct(page, products.available)
  await expect(page.getByRole('button', { name: 'Remove from wishlist', exact: true })).toBeVisible()
  await page.goto('/account/wishlist')
  await expect(wishlistHeading(page, 1)).toBeVisible()
  await page.getByRole('button', { name: 'Move to cart', exact: true }).click()
  await expect(page.getByText('Moved to cart', { exact: true })).toBeVisible()
  await expect(wishlistHeading(page, 0)).toBeVisible()
  await expect(
    page.getByRole('link', { name: 'Cart with 1 items', exact: true }).filter({ visible: true }),
  ).toBeVisible()
  await expect.poll(() => wishlistIds(page)).toEqual([])

  await page.goto('/cart')
  await expect(page.getByText(products.available.name, { exact: true })).toBeVisible()
  await openProduct(page, products.available)
  await expect(page.getByRole('button', { name: 'Add to wishlist', exact: true })).toBeVisible()

  await openProduct(page, products.outOfStock)
  await expect(page.getByText('Out of stock', { exact: true }).first()).toBeVisible()
  await expect(page.getByRole('button', { name: 'Add to cart', exact: true }).first()).toBeDisabled()
  await page.getByRole('button', { name: 'Add to wishlist', exact: true }).click()
  await expect(page.getByText('Added to wishlist', { exact: true })).toBeVisible()

  await page.goto('/account/wishlist')
  await expect(wishlistHeading(page, 1)).toBeVisible()
  await expect(page.getByText(products.outOfStock.name, { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Out of stock', exact: true })).toBeDisabled()
  await expect(
    page.getByRole('link', { name: 'Cart with 1 items', exact: true }).filter({ visible: true }),
  ).toBeVisible()
  await page.reload()
  await expect(wishlistHeading(page, 1)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Out of stock', exact: true })).toBeDisabled()

  await signOut(page)
  await page.goto('/account/wishlist')
  await expect(page).toHaveURL('/auth/login')
  await signIn(page)
  await expect(page).toHaveURL('/account/wishlist')
  await expect(wishlistHeading(page, 1)).toBeVisible()
  await expect(page.getByText(products.outOfStock.name, { exact: true })).toBeVisible()
  await expect.poll(() => wishlistIds(page)).toEqual([products.outOfStock.id])

  await page
    .getByRole('button', { name: `Remove ${products.outOfStock.name} from wishlist`, exact: true })
    .click()
  await expect(wishlistHeading(page, 0)).toBeVisible()
  await page.reload()
  await expect(wishlistHeading(page, 0)).toBeVisible()

  console.info(
    'WISHLIST_E2E storage=localStorage public-add=true account-auth=true reload=true duplicate-count=1 ' +
      'cross-surface=true move-to-cart=removes out-of-stock=retained-and-disabled logout-login=true',
  )
})
