import { expect, test as base } from '@playwright/test'

export const test = base.extend({
  page: async ({ baseURL, page }, run) => {
    const appOrigin = new URL(baseURL ?? 'http://127.0.0.1:5173').origin

    await page.route('**/*', async (route) => {
      const requestURL = new URL(route.request().url())
      const isNetworkRequest = requestURL.protocol === 'http:' || requestURL.protocol === 'https:'

      if (isNetworkRequest && requestURL.origin !== appOrigin) {
        await route.abort('blockedbyclient')
        return
      }

      await route.continue()
    })

    await run(page)
  },
})

export { expect }
