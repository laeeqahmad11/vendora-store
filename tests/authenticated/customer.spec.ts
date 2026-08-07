import { expect, test } from '../fixtures'

test('customer authenticated state reaches the account area', async ({ page }) => {
  await page.goto('/account')

  await expect(page).toHaveURL('/account')
  await expect(page.getByRole('heading', { name: 'My account', exact: true })).toBeVisible()
  await expect(page.getByText('customer@e2e.vendora.test', { exact: true }).first()).toBeVisible()
})
