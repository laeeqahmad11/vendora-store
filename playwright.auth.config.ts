import path from 'node:path'
import { defineConfig, devices } from '@playwright/test'

const baseURL = 'http://127.0.0.1:5173'
const managedServer = process.env.PLAYWRIGHT_MANAGED_SERVER === 'true'
const authState = (role: 'customer' | 'merchant' | 'admin') => path.resolve('tests', '.auth', `${role}.json`)

const sharedUse = {
  ...devices['Desktop Chrome'],
  baseURL,
  screenshot: 'only-on-failure' as const,
  serviceWorkers: 'block' as const,
  trace: 'retain-on-failure' as const,
}

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  timeout: 30_000,
  expect: {
    timeout: 10_000,
  },
  outputDir: 'test-results/authenticated',
  reporter: [['list'], ['html', { outputFolder: 'playwright-report/authenticated', open: 'never' }]],
  projects: [
    {
      name: 'auth-setup',
      testMatch: /auth\.setup\.ts/,
      metadata: { allowFirebaseEmulators: true },
      use: sharedUse,
    },
    {
      name: 'customer',
      testMatch: /authenticated\/customer\.spec\.ts/,
      dependencies: ['auth-setup'],
      metadata: { allowFirebaseEmulators: true },
      use: { ...sharedUse, storageState: authState('customer') },
    },
    {
      name: 'customer-account',
      testMatch: /authenticated\/customer-account\.spec\.ts/,
      dependencies: ['auth-setup'],
      metadata: { allowFirebaseEmulators: true },
      use: { ...sharedUse, storageState: authState('customer') },
    },
    {
      name: 'wishlist',
      testMatch: /authenticated\/wishlist\.spec\.ts/,
      dependencies: ['auth-setup'],
      metadata: { allowFirebaseEmulators: true },
      use: { ...sharedUse, storageState: authState('customer') },
    },
    {
      name: 'reviews-ratings',
      testMatch: /authenticated\/reviews-ratings\.spec\.ts/,
      dependencies: ['auth-setup'],
      metadata: { allowFirebaseEmulators: true },
      use: { ...sharedUse, storageState: authState('customer') },
    },
    {
      name: 'merchant',
      testMatch: /authenticated\/merchant(?:-products)?\.spec\.ts/,
      dependencies: ['auth-setup'],
      metadata: { allowFirebaseEmulators: true },
      use: { ...sharedUse, storageState: authState('merchant') },
    },
    {
      name: 'merchant-inventory',
      testMatch: /authenticated\/merchant-inventory\.spec\.ts/,
      dependencies: ['auth-setup'],
      metadata: { allowFirebaseEmulators: true },
      use: { ...sharedUse, storageState: authState('merchant') },
    },
    {
      name: 'admin',
      testMatch: /authenticated\/admin\.spec\.ts/,
      dependencies: ['auth-setup'],
      metadata: { allowFirebaseEmulators: true },
      use: { ...sharedUse, storageState: authState('admin') },
    },
    {
      name: 'product-approval',
      testMatch: /authenticated\/product-approval\.spec\.ts/,
      dependencies: ['auth-setup'],
      metadata: { allowFirebaseEmulators: true },
      use: { ...sharedUse, storageState: authState('merchant') },
    },
    {
      name: 'customer-order',
      testMatch: /authenticated\/customer-order\.spec\.ts/,
      dependencies: ['auth-setup'],
      metadata: { allowFirebaseEmulators: true },
      use: { ...sharedUse, storageState: authState('customer') },
    },
    {
      name: 'checkout-stock-edge',
      testMatch: /authenticated\/checkout-stock-edge\.spec\.ts/,
      dependencies: ['auth-setup'],
      metadata: { allowFirebaseEmulators: true },
      use: { ...sharedUse, storageState: authState('customer') },
    },
    {
      name: 'checkout-idempotency',
      testMatch: /authenticated\/checkout-idempotency\.spec\.ts/,
      dependencies: ['auth-setup'],
      metadata: { allowFirebaseEmulators: true },
      use: { ...sharedUse, storageState: authState('customer') },
    },
    {
      name: 'variant-inventory',
      testMatch: /authenticated\/variant-inventory\.spec\.ts/,
      dependencies: ['auth-setup'],
      metadata: { allowFirebaseEmulators: true },
      use: { ...sharedUse, storageState: authState('customer') },
    },
    {
      name: 'discounts-coupons',
      testMatch: /authenticated\/discounts-coupons\.spec\.ts/,
      dependencies: ['auth-setup'],
      metadata: { allowFirebaseEmulators: true },
      use: { ...sharedUse, storageState: authState('customer') },
    },
    {
      name: 'merchant-order-fulfillment',
      testMatch: /authenticated\/merchant-order-fulfillment\.spec\.ts/,
      dependencies: ['auth-setup'],
      metadata: { allowFirebaseEmulators: true },
      use: { ...sharedUse, storageState: authState('customer') },
    },
    {
      name: 'order-cancellation',
      testMatch: /authenticated\/order-cancellation\.spec\.ts/,
      dependencies: ['auth-setup'],
      metadata: { allowFirebaseEmulators: true },
      use: { ...sharedUse, storageState: authState('customer') },
    },
    {
      name: 'merchant-order-cancellation',
      testMatch: /authenticated\/merchant-order-cancellation\.spec\.ts/,
      dependencies: ['auth-setup'],
      metadata: { allowFirebaseEmulators: true },
      use: { ...sharedUse, storageState: authState('customer') },
    },
    {
      name: 'return-refund',
      testMatch: /authenticated\/return-refund\.spec\.ts/,
      dependencies: ['auth-setup'],
      metadata: { allowFirebaseEmulators: true },
      use: { ...sharedUse, storageState: authState('customer') },
    },
  ],
  webServer: managedServer
    ? undefined
    : {
        command: 'node ./node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5173 --strictPort',
        url: baseURL,
        reuseExistingServer: false,
        timeout: 120_000,
        gracefulShutdown: { signal: 'SIGINT', timeout: 1_000 },
        env: {
          ...process.env,
          VITE_FIREBASE_API_KEY: 'demo-vendora-e2e-api-key',
          VITE_FIREBASE_AUTH_DOMAIN: 'demo-vendora-e2e.firebaseapp.com',
          VITE_FIREBASE_PROJECT_ID: 'demo-vendora-e2e',
          VITE_FIREBASE_STORAGE_BUCKET: 'demo-vendora-e2e.appspot.com',
          VITE_FIREBASE_MESSAGING_SENDER_ID: '000000000000',
          VITE_FIREBASE_APP_ID: '1:000000000000:web:e2e000000000000000000',
          VITE_USE_EMULATORS: 'true',
        },
      },
})
