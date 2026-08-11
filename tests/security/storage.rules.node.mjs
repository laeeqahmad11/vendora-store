import { after, before, test } from 'node:test'
import { readFile } from 'node:fs/promises'

import {
  assertFails,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing'

const PROJECT_ID = 'demo-vendora-e2e'
const STORAGE_HOST = '127.0.0.1'
const STORAGE_PORT = 9199
const BUCKET_URL = `gs://${PROJECT_ID}.appspot.com`

let testEnv
let anonymousStorage
let customerStorage
let otherCustomerStorage
let merchantStorage
let otherMerchantStorage
let suspendedMerchantStorage
let adminStorage

function object(storage, path) {
  return storage.ref(path)
}

function upload(storage, path, {
  body = 'vendora-test-object',
  contentType = 'image/png',
  customMetadata,
} = {}) {
  return object(storage, path).putString(body, 'raw', {
    contentType,
    ...(customMetadata ? { customMetadata } : {}),
  })
}

async function seedObject(path, contentType = 'application/octet-stream') {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await upload(context.storage(BUCKET_URL), path, { contentType })
  })
}

before(async () => {
  if (PROJECT_ID !== 'demo-vendora-e2e') {
    throw new Error(`Refusing non-demo Firebase project: ${PROJECT_ID}`)
  }
  if (STORAGE_HOST !== '127.0.0.1') {
    throw new Error(`Refusing non-loopback Storage host: ${STORAGE_HOST}`)
  }

  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    storage: {
      host: STORAGE_HOST,
      port: STORAGE_PORT,
      rules: await readFile(
        new URL('../../storage.rules', import.meta.url),
        'utf8',
      ),
    },
  })
  await testEnv.clearStorage()

  anonymousStorage = testEnv.unauthenticatedContext().storage(BUCKET_URL)
  customerStorage = testEnv
    .authenticatedContext('customer-1', { role: 'customer' })
    .storage(BUCKET_URL)
  otherCustomerStorage = testEnv
    .authenticatedContext('customer-2', { role: 'customer' })
    .storage(BUCKET_URL)
  merchantStorage = testEnv
    .authenticatedContext('merchant-1', {
      role: 'merchant',
      storeId: 'store-1',
    })
    .storage(BUCKET_URL)
  otherMerchantStorage = testEnv
    .authenticatedContext('merchant-2', {
      role: 'merchant',
      storeId: 'store-2',
    })
    .storage(BUCKET_URL)
  suspendedMerchantStorage = testEnv
    .authenticatedContext('merchant-suspended', {
      role: 'merchant',
      storeId: 'store-suspended',
      suspended: true,
    })
    .storage(BUCKET_URL)
  adminStorage = testEnv
    .authenticatedContext('admin-1', { role: 'admin' })
    .storage(BUCKET_URL)

  await Promise.all([
    seedObject('public/products/existing.png', 'image/png'),
    seedObject('users/customer-1/avatar.png', 'image/png'),
    seedObject('stores/store-1/products/existing.png', 'image/png'),
    seedObject('applications/merchant-1/legal.pdf', 'application/pdf'),
  ])
})

after(async () => {
  await testEnv?.cleanup()
})

test('anonymous users cannot write any object', async () => {
  await assertFails(upload(anonymousStorage, 'public/products/new.png'))
})

test('authenticated users cannot read or write their apparent owner path', async () => {
  await assertFails(
    object(customerStorage, 'users/customer-1/avatar.png').getMetadata(),
  )
  await assertFails(upload(customerStorage, 'users/customer-1/new-avatar.png'))
})

test('cross-user overwrite is denied', async () => {
  await assertFails(
    upload(otherCustomerStorage, 'users/customer-1/avatar.png'),
  )
})

test('suspended users cannot write', async () => {
  await assertFails(
    upload(
      suspendedMerchantStorage,
      'stores/store-suspended/products/new.png',
    ),
  )
})

test('customers cannot write merchant store paths', async () => {
  await assertFails(upload(customerStorage, 'stores/store-1/branding/logo.png'))
})

test("merchants cannot write another store's path", async () => {
  await assertFails(
    upload(otherMerchantStorage, 'stores/store-1/products/new.png'),
  )
})

test('merchant application documents remain private', async () => {
  const path = 'applications/merchant-1/legal.pdf'
  await assertFails(object(anonymousStorage, path).getMetadata())
  await assertFails(object(otherMerchantStorage, path).getMetadata())
  await assertFails(object(merchantStorage, path).getMetadata())
})

test('invalid MIME uploads are denied', async () => {
  await assertFails(
    upload(merchantStorage, 'stores/store-1/products/payload.png', {
      body: '<script>alert(1)</script>',
      contentType: 'text/html',
    }),
  )
})

test('oversized uploads are denied', async () => {
  const oversized = new Uint8Array(10 * 1024 * 1024 + 1)
  await assertFails(
    object(merchantStorage, 'stores/store-1/products/oversized.png').put(
      oversized,
      { contentType: 'image/png' },
    ),
  )
})

test('apparent owners cannot delete objects while Storage is unsupported', async () => {
  await assertFails(
    object(customerStorage, 'users/customer-1/avatar.png').delete(),
  )
  await assertFails(
    object(merchantStorage, 'stores/store-1/products/existing.png').delete(),
  )
})

test('anonymous public-asset reads are denied', async () => {
  await assertFails(
    object(anonymousStorage, 'public/products/existing.png').getMetadata(),
  )
})

test('forged paths and ownership metadata do not grant access', async () => {
  await assertFails(
    upload(
      customerStorage,
      'users/customer-1/%2e%2e/applications/merchant-1/legal.pdf',
      {
        contentType: 'application/pdf',
        customMetadata: {
          ownerId: 'customer-1',
          role: 'admin',
          public: 'true',
        },
      },
    ),
  )
})

test('admins have no client Storage bypass', async () => {
  await assertFails(
    object(adminStorage, 'public/products/existing.png').getMetadata(),
  )
  await assertFails(upload(adminStorage, 'cms/banners/new.png'))
  await assertFails(
    object(adminStorage, 'applications/merchant-1/legal.pdf').delete(),
  )
})
