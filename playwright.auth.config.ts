import path from 'node:path'
import { defineConfig, devices } from '@playwright/test'

const baseURL = 'http://127.0.0.1:5173'
const authState = (role: 'customer' | 'merchant' | 'admin') =>
  path.resolve('tests', '.auth', `${role}.json`)

const sharedUse = {
  ...devices['Desktop Chrome'],
  baseURL,
  screenshot: 'only-on-failure' as const,
  serviceWorkers: 'block' as const,
  trace: 'on-first-retry' as const,
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
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report/authenticated', open: 'never' }],
  ],
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
      name: 'merchant',
      testMatch: /authenticated\/merchant(?:-products)?\.spec\.ts/,
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
  ],
  webServer: {
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
