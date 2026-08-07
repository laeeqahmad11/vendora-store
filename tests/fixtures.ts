import { expect, test as base } from '@playwright/test'

export const test = base.extend({
  page: async ({ baseURL, page }, run, testInfo) => {
    const appOrigin = new URL(baseURL ?? 'http://127.0.0.1:5173').origin
    const allowedOrigins = new Set([appOrigin])

    if (testInfo.project.metadata.allowFirebaseEmulators === true) {
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

    await run(page)
  },
})

export { expect }
