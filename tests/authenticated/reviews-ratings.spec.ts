import { execFile } from 'node:child_process'
import path from 'node:path'
import { promisify } from 'node:util'
import type { Browser, BrowserContext, Locator, Page } from '@playwright/test'
import { expect, installNetworkPolicy, test } from '../fixtures'

const execFileAsync = promisify(execFile)
const projectId = 'demo-vendora-e2e'
const firestoreOrigin = 'http://127.0.0.1:8080'
const product = {
  id: 'e2e-reviews-product',
  name: 'E2E Reviews Product',
  slug: 'e2e-reviews-product',
} as const
const foreignReviewComment =
  'Foreign-store review must stay outside the approved merchant UI.'
const firstReview = {
  title: 'Excellent emulator product',
  comment: 'Five stars from the deterministic review workflow.',
  rating: 5,
} as const
const secondReview = {
  title: 'Repeat review is supported',
  comment: 'Four stars from the same customer and product.',
  rating: 4,
} as const
const merchantReply = 'Thanks for testing reviews through the localhost storefront.'
const authState = (role: 'merchant' | 'admin') =>
  path.resolve('tests', '.auth', `${role}.json`)

type FirestoreValue = {
  stringValue?: string
  integerValue?: string
  doubleValue?: number
  booleanValue?: boolean
  timestampValue?: string
}

type FirestoreDocument = {
  name: string
  fields: Record<string, FirestoreValue>
}

async function resetAndSeedReviews() {
  await execFileAsync(process.execPath, [
    path.resolve('scripts/e2e/seed-emulators.mjs'),
    '--preserve-auth',
    '--reviews-fixtures',
  ])
}

async function emulatorJson(pathname: string) {
  // State inspection is test infrastructure, not a storefront access check.
  // The emulator-only owner token bypasses rules so hidden/rejected documents
  // remain observable here while browser assertions exercise real client rules.
  const response = await fetch(`${firestoreOrigin}${pathname}`, {
    headers: { Authorization: 'Bearer owner' },
  })
  if (!response.ok) {
    throw new Error(`Firestore emulator request failed (${response.status}): ${await response.text()}`)
  }
  return response.json() as Promise<{ documents?: FirestoreDocument[] } | FirestoreDocument>
}

async function productDocument(): Promise<FirestoreDocument> {
  return emulatorJson(
    `/v1/projects/${projectId}/databases/(default)/documents/products/${product.id}`,
  ) as Promise<FirestoreDocument>
}

async function productReviews(): Promise<FirestoreDocument[]> {
  const result = (await emulatorJson(
    `/v1/projects/${projectId}/databases/(default)/documents/reviews?pageSize=100`,
  )) as { documents?: FirestoreDocument[] }
  return (result.documents ?? []).filter(
    (document) => document.fields.productId?.stringValue === product.id,
  )
}

function numberValue(value: FirestoreValue | undefined): number {
  if (value?.doubleValue != null) return value.doubleValue
  if (value?.integerValue != null) return Number(value.integerValue)
  throw new Error(`Expected numeric Firestore value, received ${JSON.stringify(value)}`)
}

async function expectAggregate(rating: number, ratingCount: number) {
  await expect
    .poll(async () => {
      const document = await productDocument()
      return {
        rating: numberValue(document.fields.rating),
        ratingCount: numberValue(document.fields.ratingCount),
      }
    })
    .toEqual({ rating, ratingCount })
}

async function newSafePage(
  browser: Browser,
  baseURL: string,
  storageState?: string,
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({
    baseURL,
    serviceWorkers: 'block',
    storageState: storageState ?? { cookies: [], origins: [] },
  })
  const page = await context.newPage()
  await installNetworkPolicy(page, baseURL, true)
  return { context, page }
}

async function openProductReviews(page: Page, count: number) {
  await page.goto(`/products/${product.slug}`)
  await expect(page).toHaveURL(`/products/${product.slug}`)
  await expect(page.getByRole('heading', { name: product.name, exact: true })).toBeVisible()
  await page.getByRole('tab', { name: `Reviews (${count})`, exact: true }).click()
}

function reviewForm(page: Page): Locator {
  return page.locator('form').filter({
    has: page.getByRole('heading', { name: 'Write a review', exact: true }),
  })
}

function reviewContainer(page: Page, comment: string): Locator {
  return page.getByText(comment, { exact: true }).locator('..')
}

async function assertPublicAggregate(page: Page, rating: string, count: number) {
  await page.goto('/stores/e2e-approved-store')
  const card = page.getByRole('link').filter({ hasText: product.name }).first()
  await expect(card).toBeVisible()
  await expect(card).toContainText(new RegExp(`${rating.replace('.', '\\.')}\\s*\\(${count}\\)`))
}

async function signOut(page: Page) {
  await page
    .getByRole('button', { name: 'Open account menu', exact: true })
    .filter({ visible: true })
    .click()
  await page.getByRole('menuitem', { name: 'Sign out', exact: true }).click()
  await expect(page.getByText('Signed out', { exact: true })).toBeVisible()
}

async function signInAsCustomer(page: Page) {
  await page.locator('input[type="email"]').fill('customer@e2e.vendora.test')
  await page.locator('input[type="password"]').fill('VendoraE2E!123')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByText('Welcome back, E2E Customer!', { exact: true })).toBeVisible()
}

test.beforeEach(resetAndSeedReviews)

test('reviews publish, aggregate, persist, repeat, reply, moderate, and delete through real UI', async ({
  baseURL,
  browser,
  page: customerPage,
}) => {
  test.setTimeout(120_000)
  const appURL = baseURL ?? 'http://127.0.0.1:5173'
  const openedContexts: BrowserContext[] = []

  try {
    const publicStorefront = await newSafePage(browser, appURL)
    openedContexts.push(publicStorefront.context)
    const merchant = await newSafePage(browser, appURL, authState('merchant'))
    openedContexts.push(merchant.context)
    const admin = await newSafePage(browser, appURL, authState('admin'))
    openedContexts.push(admin.context)

    await openProductReviews(publicStorefront.page, 0)
    await expect(
      publicStorefront.page
        .getByRole('tabpanel')
        .getByRole('link', { name: 'Sign in', exact: true }),
    ).toBeVisible()
    await expect(
      publicStorefront.page.getByRole('heading', { name: 'Write a review', exact: true }),
    ).toHaveCount(0)

    await customerPage.goto('/account/orders')
    await expect(customerPage.getByRole('heading', { name: 'No orders yet', exact: true })).toBeVisible()

    await openProductReviews(customerPage, 0)
    const form = reviewForm(customerPage)
    await expect(form).toBeVisible()
    await expect(form.getByRole('button', { name: /^\d stars?$/ })).toHaveCount(5)
    await expect(form.getByRole('button', { name: '1 star', exact: true })).toBeVisible()
    await expect(form.getByRole('button', { name: '5 stars', exact: true })).toBeVisible()

    const comment = form.getByPlaceholder('What did you like or dislike?', { exact: true })
    await comment.fill('Validation-only comment')
    await form.getByRole('button', { name: 'Submit review', exact: true }).click()
    await expect(customerPage.getByText('Please select a star rating.', { exact: true })).toBeVisible()
    await expect.poll(async () => (await productReviews()).length).toBe(0)

    await form.getByRole('button', { name: '5 stars', exact: true }).click()
    await comment.fill('')
    await form.getByRole('button', { name: 'Submit review', exact: true }).click()
    expect(
      await comment.evaluate((element: HTMLTextAreaElement) => element.validity.valueMissing),
    ).toBe(true)
    await expect.poll(async () => (await productReviews()).length).toBe(0)

    await form.getByPlaceholder('Review title (optional)', { exact: true }).fill(firstReview.title)
    await comment.fill(firstReview.comment)
    await form
      .locator('input[type="file"]')
      .setInputFiles(path.resolve('tests/fixtures/assets/product.png'))
    await expect(form.getByRole('img', { name: 'Upload 1', exact: true })).toHaveAttribute(
      'src',
      /^data:image\/jpeg;base64,/,
    )
    await form.getByRole('button', { name: 'Submit review', exact: true }).click()
    await expect(customerPage.getByText('Thanks for your review!', { exact: true })).toBeVisible()
    await expect(customerPage.getByText(firstReview.comment, { exact: true })).toBeVisible()
    await expect(customerPage.getByRole('img', { name: 'Review', exact: true }).first()).toHaveAttribute(
      'src',
      /^data:image\/jpeg;base64,/,
    )
    await expectAggregate(5, 1)

    await expect
      .poll(async () => {
        const reviews = await productReviews()
        return reviews.find(
          (review) => review.fields.comment?.stringValue === firstReview.comment,
        )?.fields
      })
      .not.toBeUndefined()

    const firstFields = (await productReviews()).find(
      (review) => review.fields.comment?.stringValue === firstReview.comment,
    )!.fields
    expect(firstFields.productId?.stringValue).toBe(product.id)
    expect(firstFields.storeId?.stringValue).toBe('e2e-approved-store')
    expect(firstFields.customerId?.stringValue).toBe('e2e-customer')
    expect(firstFields.customerName?.stringValue).toBe('E2E Customer')
    expect(firstFields.status?.stringValue).toBe('approved')
    expect(firstFields.title?.stringValue).toBe(firstReview.title)
    expect(numberValue(firstFields.rating)).toBe(firstReview.rating)
    expect(numberValue(firstFields.helpfulCount)).toBe(0)
    expect(firstFields.orderId).toBeUndefined()
    expect(firstFields.createdAt?.timestampValue).toBeTruthy()

    await customerPage.reload()
    await expect(customerPage.getByRole('tab', { name: 'Reviews (1)', exact: true })).toBeVisible()
    await customerPage.getByRole('tab', { name: 'Reviews (1)', exact: true }).click()
    await expect(customerPage.getByText(firstReview.comment, { exact: true })).toBeVisible()
    await expect(customerPage.getByRole('img', { name: 'Review', exact: true }).first()).toHaveAttribute(
      'src',
      /^data:image\/jpeg;base64,/,
    )

    const repeatForm = reviewForm(customerPage)
    await repeatForm.getByRole('button', { name: '4 stars', exact: true }).click()
    await repeatForm
      .getByPlaceholder('Review title (optional)', { exact: true })
      .fill(secondReview.title)
    await repeatForm
      .getByPlaceholder('What did you like or dislike?', { exact: true })
      .fill(secondReview.comment)
    await repeatForm.getByRole('button', { name: 'Submit review', exact: true }).click()
    await expect(customerPage.getByText('Thanks for your review!', { exact: true })).toBeVisible()
    await expect(customerPage.getByText(secondReview.comment, { exact: true })).toBeVisible()
    await expect.poll(async () => (await productReviews()).length).toBe(2)
    await expectAggregate(4.5, 2)
    await assertPublicAggregate(publicStorefront.page, '4.5', 2)

    await openProductReviews(publicStorefront.page, 2)
    await expect(publicStorefront.page.getByText(firstReview.comment, { exact: true })).toBeVisible()
    await expect(publicStorefront.page.getByText(secondReview.comment, { exact: true })).toBeVisible()

    await customerPage.goto('/account/reviews')
    await expect(customerPage.getByRole('heading', { name: 'My reviews', exact: true })).toBeVisible()
    await expect(customerPage.getByText(firstReview.comment, { exact: true })).toBeVisible()
    await expect(customerPage.getByText(secondReview.comment, { exact: true })).toBeVisible()
    await expect(customerPage.getByText('Published', { exact: true })).toHaveCount(2)
    await expect(customerPage.getByRole('button', { name: /edit|delete/i })).toHaveCount(0)

    await merchant.page.goto('/merchant/reviews')
    await expect(merchant.page.getByRole('heading', { name: 'Reviews', exact: true })).toBeVisible()
    await expect(merchant.page.getByRole('tab', { name: 'All (2)', exact: true })).toBeVisible()
    await expect(merchant.page.getByText(firstReview.comment, { exact: true })).toBeVisible()
    await expect(merchant.page.getByText(secondReview.comment, { exact: true })).toBeVisible()
    await expect(merchant.page.getByText(foreignReviewComment, { exact: true })).toHaveCount(0)

    const merchantFirst = reviewContainer(merchant.page, firstReview.comment)
    await merchantFirst.getByRole('button', { name: 'Reply', exact: true }).click()
    const replyDialog = merchant.page.getByRole('dialog')
    await expect(
      replyDialog.getByRole('heading', { name: 'Reply to E2E Customer', exact: true }),
    ).toBeVisible()
    await replyDialog.getByPlaceholder(/Thanks for your feedback/).fill(merchantReply)
    await replyDialog.getByRole('button', { name: 'Post reply', exact: true }).click()
    await expect(merchant.page.getByText('Reply posted', { exact: true })).toBeVisible()
    await expect(merchant.page.getByText(merchantReply, { exact: true })).toBeVisible()

    const merchantSecond = reviewContainer(merchant.page, secondReview.comment)
    await merchantSecond.getByRole('button', { name: 'Hide', exact: true }).click()
    await expect(merchant.page.getByText('Review updated', { exact: true })).toBeVisible()
    await expect(merchantSecond.getByText('Hidden', { exact: true })).toBeVisible()
    await expectAggregate(5, 1)

    await openProductReviews(publicStorefront.page, 1)
    await expect(publicStorefront.page.getByText(firstReview.comment, { exact: true })).toBeVisible()
    await expect(publicStorefront.page.getByText(merchantReply, { exact: true })).toBeVisible()
    await expect(publicStorefront.page.getByText(secondReview.comment, { exact: true })).toHaveCount(0)

    await merchantSecond.getByRole('button', { name: 'Approve', exact: true }).click()
    await expect(merchant.page.getByText('Review updated', { exact: true })).toBeVisible()
    await expect(merchantSecond.getByText('Approved', { exact: true })).toBeVisible()
    await expectAggregate(4.5, 2)

    await admin.page.goto('/admin/reviews')
    await expect(admin.page.getByRole('heading', { name: 'Reviews', exact: true })).toBeVisible()
    await expect(admin.page.getByText('Total reviews', { exact: true }).locator('..')).toContainText('3')
    await expect(admin.page.getByText(firstReview.comment, { exact: true })).toBeVisible()
    await expect(admin.page.getByText(secondReview.comment, { exact: true })).toBeVisible()
    await expect(admin.page.getByText(foreignReviewComment, { exact: true })).toBeVisible()

    const adminSecond = reviewContainer(admin.page, secondReview.comment)
    admin.page.once('dialog', (dialog) => dialog.accept())
    await adminSecond.getByRole('button', { name: 'Delete', exact: true }).click()
    await expect(admin.page.getByText('Review deleted', { exact: true })).toBeVisible()
    await expect(admin.page.getByText(secondReview.comment, { exact: true })).toHaveCount(0)
    await expect.poll(async () => (await productReviews()).length).toBe(1)
    await expectAggregate(5, 1)

    await assertPublicAggregate(publicStorefront.page, '5.0', 1)
    await openProductReviews(publicStorefront.page, 1)
    await expect(publicStorefront.page.getByText(firstReview.comment, { exact: true })).toBeVisible()
    await expect(publicStorefront.page.getByText(merchantReply, { exact: true })).toBeVisible()
    await expect(publicStorefront.page.getByText(secondReview.comment, { exact: true })).toHaveCount(0)

    await customerPage.goto('/account/reviews')
    await expect(customerPage.getByText(firstReview.comment, { exact: true })).toBeVisible()
    await expect(customerPage.getByText(merchantReply, { exact: true })).toBeVisible()
    await expect(customerPage.getByText(secondReview.comment, { exact: true })).toHaveCount(0)
    await customerPage.reload()
    await expect(customerPage.getByText(firstReview.comment, { exact: true })).toBeVisible()

    await signOut(customerPage)
    await customerPage.goto('/account/reviews')
    await expect(customerPage).toHaveURL('/auth/login')
    await signInAsCustomer(customerPage)
    await expect(customerPage).toHaveURL('/account/reviews')
    await expect(customerPage.getByText(firstReview.comment, { exact: true })).toBeVisible()
    await expect(customerPage.getByText(merchantReply, { exact: true })).toBeVisible()

    console.info(
      'REVIEWS_E2E auth=required purchase=not-required order-status=not-used rating=1-5 ' +
        'comment=required moderation=immediate duplicate=allowed aggregate=verified ' +
        'customer-edit-delete=unsupported merchant-reply-status=true admin-delete=true ' +
        'cross-store-ui-isolated=true persistence=reload-and-relogin',
    )
  } finally {
    await Promise.all(openedContexts.map((context) => context.close()))
  }
})
