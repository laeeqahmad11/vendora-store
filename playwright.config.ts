import { defineConfig, devices } from '@playwright/test'

const localBaseURL = 'http://127.0.0.1:5173'
const externalBaseURL = process.env.PLAYWRIGHT_BASE_URL

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 1,
  // A single worker keeps local Vite startup deterministic on Windows and
  // avoids multiplying Firebase-independent smoke traffic.
  workers: 1,
  timeout: 30_000,
  expect: {
    timeout: 10_000,
  },
  outputDir: 'test-results',
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
  ],
  use: {
    baseURL: externalBaseURL ?? localBaseURL,
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: externalBaseURL
    ? undefined
    : {
        command: 'node ./node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5173 --strictPort',
        url: localBaseURL,
        reuseExistingServer: false,
        timeout: 120_000,
        env: {
          ...process.env,
          // Keep smoke tests isolated from any Firebase project in .env.local.
          // The app's built-in placeholder configuration still renders public UI.
          VITE_FIREBASE_API_KEY: '',
          VITE_FIREBASE_AUTH_DOMAIN: '',
          VITE_FIREBASE_PROJECT_ID: '',
          VITE_FIREBASE_STORAGE_BUCKET: '',
          VITE_FIREBASE_MESSAGING_SENDER_ID: '',
          VITE_FIREBASE_APP_ID: '',
          VITE_USE_EMULATORS: 'false',
        },
      },
})
