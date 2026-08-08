import { expect, test as base, type Page } from '@playwright/test'

export async function installNetworkPolicy(
  page: Page,
  baseURL: string,
  allowFirebaseEmulators: boolean,
) {
  const appOrigin = new URL(baseURL).origin
  const allowedOrigins = new Set([appOrigin])

  if (allowFirebaseEmulators) {
    allowedOrigins.add('http://127.0.0.1:9099')
    allowedOrigins.add('http://127.0.0.1:8080')
    allowedOrigins.add('http://127.0.0.1:9199')
  }

  await page.route('**/*', async (route) => {
    const requestURL = new URL(route.request().url())
    const isNetworkRequest = requestURL.protocol === 'http:' || requestURL.protocol === 'https:'

    if (isNetworkRequest && !allowedOrigins.has(requestURL.origin)) {
      await route.abort('blockedbyclient')
      return
    }

    await route.continue()
  })

  await page.routeWebSocket(
    (url) => {
      const socketOrigin = `${url.protocol === 'wss:' ? 'https:' : 'http:'}//${url.host}`
      return !allowedOrigins.has(socketOrigin)
    },
    async (webSocket) => {
      await webSocket.close({ code: 1008, reason: 'Blocked by E2E network policy' })
    },
  )
}

export const test = base.extend({
  page: async ({ baseURL, page }, run, testInfo) => {
    await installNetworkPolicy(
      page,
      baseURL ?? 'http://127.0.0.1:5173',
      testInfo.project.metadata.allowFirebaseEmulators === true,
    )

    await run(page)
  },
})

export { expect }
