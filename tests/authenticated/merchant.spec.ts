import { expect, test } from '../fixtures'

test('merchant authenticated state reaches the approved merchant area', async ({ page }) => {
  await page.goto('/merchant')

  await expect(page).toHaveURL('/merchant')
  await expect(
    page.getByRole('heading', { name: 'Welcome back, E2E Approved Store', exact: true }),
  ).toBeVisible()
  await expect(page.getByText('Store application', { exact: true })).toHaveCount(0)
})
