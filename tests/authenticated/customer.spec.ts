import { expect, test } from '../fixtures'

test('customer authenticated state reaches the account area', async ({ page }) => {
  await page.goto('/account')

  await expect(page).toHaveURL('/account')
  await expect(page.getByRole('heading', { name: 'My account', exact: true })).toBeVisible()
  await expect(page.getByText('customer@e2e.vendora.test', { exact: true }).first()).toBeVisible()
})

test('notification bell and page load trusted notifications and preserve owner read-state updates', async ({ page }) => {
  await page.goto('/account')

  await page.getByRole('button', { name: 'Notifications', exact: true }).click()
  await expect(page.getByText('Welcome to Vendora notifications', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Mark all read', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Mark all read', exact: true })).toHaveCount(0)

  await page.goto('/account/notifications')
  await expect(page.getByRole('heading', { name: 'Notifications', exact: true })).toBeVisible()
  await expect(page.getByText('Welcome to Vendora notifications', { exact: true })).toBeVisible()
  await expect(page.getByText(/\(\d+ new\)/)).toHaveCount(0)
})
