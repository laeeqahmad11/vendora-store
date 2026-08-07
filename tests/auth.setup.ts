import fs from 'node:fs/promises'
import path from 'node:path'
import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'

const password = 'VendoraE2E!123'
const authDirectory = path.resolve('tests', '.auth')

const accounts = [
  {
    role: 'customer',
    email: 'customer@e2e.vendora.test',
    displayName: 'E2E Customer',
    destination: '/account',
    heading: 'My account',
  },
  {
    role: 'merchant',
    email: 'merchant@e2e.vendora.test',
    displayName: 'E2E Merchant',
    destination: '/merchant',
    heading: 'Welcome back, E2E Approved Store',
  },
  {
    role: 'admin',
    email: 'admin@e2e.vendora.test',
    displayName: 'E2E Admin',
    destination: '/admin',
    heading: 'Overview',
  },
] as const

async function login(page: Page, account: (typeof accounts)[number]) {
  await page.goto('/auth/login')
  await page.locator('input[type="email"]').fill(account.email)
  await page.locator('input[type="password"]').fill(password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(
    page.getByText(`Welcome back, ${account.displayName}!`, { exact: true }),
  ).toBeVisible()
  await page.goto(account.destination)
  await expect(page).toHaveURL(account.destination)
  await expect(page.getByRole('heading', { name: account.heading, exact: true })).toBeVisible()
}

test.beforeAll(async () => {
  await fs.mkdir(authDirectory, { recursive: true })
})

test.describe.configure({ mode: 'serial' })

for (const account of accounts) {
  test(`authenticate ${account.role} against the Auth emulator`, async ({ page }) => {
    await login(page, account)
    const storageState = await page.context().storageState({ indexedDB: true })
    const authOnlyState = {
      ...storageState,
      origins: storageState.origins.map((origin) => ({
        ...origin,
        localStorage: origin.localStorage.filter(
          (entry) => !entry.name.startsWith('firestore_'),
        ),
        indexedDB: origin.indexedDB?.filter(
          (database) => database.name === 'firebaseLocalStorageDb',
        ),
      })),
    }

    await fs.writeFile(
      path.join(authDirectory, `${account.role}.json`),
      JSON.stringify(authOnlyState),
    )
  })
}
