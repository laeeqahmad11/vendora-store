import { test } from '../fixtures'
import {
  completeMerchantProductLifecycle,
  resetSeededEmulatorData,
} from './support/merchant-product-lifecycle'

test.beforeEach(resetSeededEmulatorData)

test('merchant creates a draft, edits stock, and submits the product for review', async ({
  page,
}) => {
  test.setTimeout(90_000)
  await completeMerchantProductLifecycle(page)
})
