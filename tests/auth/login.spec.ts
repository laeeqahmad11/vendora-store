import { expect, test } from '../fixtures'

test.describe('public authentication smoke', () => {
  test('sign-in navigation opens the login page without submitting credentials', async ({ page }) => {
    await page.goto('/')

    await page.getByRole('link', { name: 'Sign in', exact: true }).click()

    await expect(page).toHaveURL('/auth/login')
    await expect(page.getByRole('heading', { level: 2, name: 'Welcome back' })).toBeVisible()
    await expect(page.getByText(/^Email/)).toBeVisible()
    await expect(page.getByText(/^Password/)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Something went wrong' })).toHaveCount(0)
  })
})
