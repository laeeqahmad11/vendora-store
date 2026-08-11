import { execFile } from 'node:child_process'
import path from 'node:path'
import { promisify } from 'node:util'
import type { Locator, Page } from '@playwright/test'
import { expect, test } from '../fixtures'

const execFileAsync = promisify(execFile)
const customer = {
  email: 'customer@e2e.vendora.test',
  password: 'VendoraE2E!123',
} as const

const home = {
  label: 'Home',
  fullName: 'E2E Customer Home',
  phone: '03001234567',
  line1: '27 Emulator Avenue',
  city: 'Lahore',
  province: 'Punjab',
  postalCode: '54000',
  country: 'Pakistan',
} as const

const office = {
  label: 'Office',
  fullName: 'E2E Customer Office',
  phone: '03111234567',
  line1: '88 Test Runner Road',
  city: 'Karachi',
  province: 'Sindh',
  postalCode: '74000',
  country: 'Pakistan',
} as const

async function resetAccountFixtures() {
  await execFileAsync(process.execPath, [
    path.resolve('scripts/e2e/seed-emulators.mjs'),
    '--preserve-auth',
    '--checkout-stock-products',
  ])
}

function visibleAccountMenu(page: Page) {
  return page
    .getByRole('button', { name: 'Open account menu', exact: true })
    .filter({ visible: true })
}

async function signOut(page: Page) {
  await visibleAccountMenu(page).click()
  await page.getByRole('menuitem', { name: 'Sign out', exact: true }).click()
  await expect(page.getByText('Signed out', { exact: true })).toBeVisible()
}

async function signIn(page: Page, expectedName: string) {
  await page.locator('input[type="email"]').fill(customer.email)
  await page.locator('input[type="password"]').fill(customer.password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(
    page.getByText(`Welcome back, ${expectedName}!`, { exact: true }),
  ).toBeVisible()
}

async function openCreateAddress(page: Page) {
  await page.getByRole('button', { name: 'Add address', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await expect(
    dialog.getByRole('heading', { name: 'Add address', exact: true }),
  ).toBeVisible()
  return dialog
}

async function fillAddress(dialog: Locator, values: typeof home | typeof office) {
  await dialog.locator('input[autocomplete="off"]').fill(values.label)
  await dialog.locator('input[autocomplete="name"]').fill(values.fullName)
  await dialog.locator('input[autocomplete="tel"]').fill(values.phone)
  await dialog.locator('input[autocomplete="address-line1"]').fill(values.line1)
  await dialog.locator('input[autocomplete="address-level2"]').fill(values.city)
  await dialog.locator('input[autocomplete="address-level1"]').fill(values.province)
  await dialog.locator('input[autocomplete="postal-code"]').fill(values.postalCode)
  await dialog.locator('input[autocomplete="country-name"]').fill(values.country)
}

function addressCard(page: Page, label: string) {
  return page
    .getByRole('button', { name: `Delete address ${label}`, exact: true })
    .locator('xpath=ancestor::div[contains(@class, "rounded-xl")][1]')
}

async function deleteAddress(page: Page, label: string) {
  await page
    .getByRole('button', { name: `Delete address ${label}`, exact: true })
    .click()
  const dialog = page.getByRole('dialog')
  await expect(
    dialog.getByRole('heading', {
      name: 'Delete this address?',
      exact: true,
    }),
  ).toBeVisible()
  await dialog.getByRole('button', { name: 'Delete', exact: true }).click()
  await expect(page.getByText('Address deleted', { exact: true })).toBeVisible()
}

test.beforeEach(resetAccountFixtures)

test('profile validation, editing, persistence, sign-in persistence, and account navigation', async ({
  page,
}) => {
  await page.goto('/account')
  await expect(page).toHaveURL('/account')
  await expect(
    page.getByRole('heading', { name: 'My account', exact: true }),
  ).toBeVisible()

  const displayName = page.locator('input[autocomplete="name"]')
  const phone = page.locator('input[autocomplete="tel"]')
  const email = page.locator('input[disabled]')

  await expect(displayName).toHaveValue('E2E Customer')
  await expect(phone).toHaveValue('03001234567')
  await expect(email).toBeDisabled()

  await displayName.fill('')
  await page.getByRole('button', { name: 'Save changes', exact: true }).click()
  await expect(
    page.getByText('Display name cannot be empty.', { exact: true }),
  ).toBeVisible()

  await displayName.fill('Invalid @ Name')
  await page.getByRole('button', { name: 'Save changes', exact: true }).click()
  await expect(
    page.getByText(
      'Display name can contain letters, numbers and spaces only.',
      { exact: true },
    ),
  ).toBeVisible()

  await displayName.fill('E2E Account Customer')
  await phone.fill('12345')
  await page.getByRole('button', { name: 'Save changes', exact: true }).click()
  await expect(
    page.getByText('Phone number must contain 10 to 15 digits.', {
      exact: true,
    }),
  ).toBeVisible()

  await phone.fill('03221234567')
  await page
    .locator('input[type="file"]')
    .setInputFiles(path.resolve('tests/fixtures/assets/product.png'))
  await expect(page.getByRole('img', { name: 'Upload 1', exact: true })).toHaveAttribute(
    'src',
    /^data:image\/jpeg;base64,/,
  )
  await page.getByRole('button', { name: 'Save changes', exact: true }).click()
  await expect(page.getByText('Profile updated', { exact: true })).toBeVisible()

  await page.reload()
  await expect(displayName).toHaveValue('E2E Account Customer')
  await expect(phone).toHaveValue('03221234567')
  await expect(email).toHaveValue(customer.email)
  await expect(page.getByRole('img', { name: 'Upload 1', exact: true })).toHaveAttribute(
    'src',
    /^data:image\/jpeg;base64,/,
  )

  await page.getByRole('link', { name: 'Orders', exact: true }).click()
  await expect(page).toHaveURL('/account/orders')
  await expect(
    page.getByRole('heading', { name: 'My orders', exact: true }),
  ).toBeVisible()
  await page.getByRole('link', { name: 'Wishlist', exact: true }).click()
  await expect(page).toHaveURL('/account/wishlist')
  await expect(page.getByRole('heading', { name: /My wishlist/ })).toBeVisible()
  await page.getByRole('link', { name: 'Profile', exact: true }).click()
  await expect(page).toHaveURL('/account')

  await signOut(page)
  await page.goto('/account')
  await expect(page).toHaveURL('/auth/login')
  await signIn(page, 'E2E Account Customer')
  await expect(page).toHaveURL('/account')
  await expect(displayName).toHaveValue('E2E Account Customer')
  await expect(phone).toHaveValue('03221234567')
  await expect(page.getByRole('img', { name: 'Upload 1', exact: true })).toHaveAttribute(
    'src',
    /^data:image\/jpeg;base64,/,
  )
})

test('address validation, CRUD, default changes, reload, and sign-in persistence', async ({
  page,
}) => {
  await page.goto('/account/addresses')
  await expect(page).toHaveURL('/account/addresses')
  await expect(
    page.getByRole('heading', { name: 'No addresses yet', exact: true }),
  ).toBeVisible()

  let dialog = await openCreateAddress(page)
  await dialog.getByRole('button', { name: 'Add address', exact: true }).click()
  await expect(
    dialog.getByText('A label like "Home" is required', { exact: true }),
  ).toBeVisible()
  await expect(
    dialog.getByText('Full name is required', { exact: true }),
  ).toBeVisible()

  await fillAddress(dialog, home)
  await expect(dialog.getByRole('checkbox')).toBeChecked()
  await dialog.getByRole('button', { name: 'Add address', exact: true }).click()
  await expect(page.getByText('Address added', { exact: true })).toBeVisible()
  await expect(addressCard(page, home.label)).toContainText('Default')

  await page.reload()
  await expect(addressCard(page, home.label)).toContainText(home.line1)
  await expect(addressCard(page, home.label)).toContainText('Default')

  dialog = await openCreateAddress(page)
  await fillAddress(dialog, office)
  await expect(dialog.getByRole('checkbox')).not.toBeChecked()
  await dialog.getByRole('button', { name: 'Add address', exact: true }).click()
  await expect(page.getByText('Address added', { exact: true })).toBeVisible()
  await expect(addressCard(page, office.label)).not.toContainText('Default')

  await addressCard(page, office.label)
    .getByRole('button', { name: 'Edit', exact: true })
    .click()
  dialog = page.getByRole('dialog')
  await expect(
    dialog.getByRole('heading', { name: 'Edit address', exact: true }),
  ).toBeVisible()
  await dialog.locator('input[autocomplete="address-level2"]').fill('Islamabad')
  await dialog.getByRole('button', { name: 'Save changes', exact: true }).click()
  await expect(page.getByText('Address updated', { exact: true })).toBeVisible()
  await expect(addressCard(page, office.label)).toContainText('Islamabad')
  await expect(addressCard(page, home.label)).toContainText(home.city)

  await addressCard(page, office.label)
    .getByRole('button', { name: 'Set default', exact: true })
    .click()
  await expect(
    page.getByText('Default address updated', { exact: true }),
  ).toBeVisible()
  await expect(addressCard(page, office.label)).toContainText('Default')
  await expect(addressCard(page, home.label)).not.toContainText('Default')

  await signOut(page)
  await page.goto('/account/addresses')
  await expect(page).toHaveURL('/auth/login')
  await signIn(page, 'E2E Customer')
  await expect(page).toHaveURL('/account/addresses')
  await expect(addressCard(page, office.label)).toContainText('Islamabad')
  await expect(addressCard(page, office.label)).toContainText('Default')
  await expect(addressCard(page, home.label)).not.toContainText('Default')

  await deleteAddress(page, office.label)
  await expect(addressCard(page, office.label)).toHaveCount(0)
  await expect(addressCard(page, home.label)).toContainText('Default')

  await deleteAddress(page, home.label)
  await expect(
    page.getByRole('heading', { name: 'No addresses yet', exact: true }),
  ).toBeVisible()
})

test('checkout offers a saved address and applies it to delivery details', async ({
  page,
}) => {
  await page.goto('/account/addresses')
  const dialog = await openCreateAddress(page)
  await fillAddress(dialog, home)
  await dialog.getByRole('button', { name: 'Add address', exact: true }).click()
  await expect(page.getByText('Address added', { exact: true })).toBeVisible()

  await page.goto('/products/e2e-checkout-limited-stock')
  await expect(
    page.getByRole('heading', {
      name: 'E2E Checkout Limited Stock',
      exact: true,
    }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Add to cart', exact: true }).click()
  await page
    .getByRole('link', { name: 'Cart with 1 items', exact: true })
    .filter({ visible: true })
    .click()
  await page
    .getByRole('button', { name: 'Proceed to checkout', exact: true })
    .click()

  await expect(page).toHaveURL('/checkout')
  await expect(
    page.getByRole('heading', { name: 'Saved addresses', exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: /Home/ }).click()
  await expect(page.locator('input[autocomplete="name"]')).toHaveValue(
    home.fullName,
  )
  await expect(page.locator('input[autocomplete="tel"]')).toHaveValue(home.phone)
  await expect(page.locator('input[autocomplete="address-line1"]')).toHaveValue(
    home.line1,
  )
  await expect(
    page.locator('input[autocomplete="address-level2"]'),
  ).toHaveValue(home.city)
  await expect(page.locator('input[autocomplete="email"]')).toHaveValue(
    customer.email,
  )
})
