import { expect, test } from '../fixtures'

test('admin authenticated state reaches the admin area', async ({ page }) => {
  await page.goto('/admin')

  await expect(page).toHaveURL('/admin')
  await expect(page.getByRole('heading', { name: 'Overview', exact: true })).toBeVisible()
  await expect(page.getByText('Platform-wide health at a glance.')).toBeVisible()
})
