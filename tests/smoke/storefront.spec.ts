import { expect, test } from '../fixtures'

test.describe('public storefront smoke', () => {
  test('application and storefront home render without a page crash', async ({ page }) => {
    const response = await page.goto('/')

    expect(response?.ok()).toBe(true)
    await expect(page).toHaveTitle(/Vendora/)
    await expect(
      page.getByRole('heading', {
        level: 1,
        name: /shop unique products from independent brands/i,
      }),
    ).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Something went wrong' })).toHaveCount(0)
  })

  test('primary navigation opens the public shop page', async ({ page }) => {
    await page.goto('/')

    await page.getByRole('link', { name: 'Shop', exact: true }).click()

    await expect(page).toHaveURL('/shop')
    await expect(page.getByRole('heading', { level: 1, name: 'Shop' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Something went wrong' })).toHaveCount(0)
  })
})
