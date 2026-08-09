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

  const allowedHosts = [...allowedOrigins]
    .map((origin) => new URL(origin).host.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|')
  const blockedHttp = new RegExp(`^https?://(?!(?:${allowedHosts})(?:/|$))`, 'i')
  const blockedWebSocket = new RegExp(`^wss?://(?!(?:${allowedHosts})(?:/|$))`, 'i')

  // Match only forbidden origins so allowed localhost responses retain normal
  // browser caching and bypass unnecessary Playwright route dispatch.
  await page.route(blockedHttp, (route) => route.abort('blockedbyclient'))
  await page.routeWebSocket(blockedWebSocket, (webSocket) =>
    webSocket.close({ code: 1008, reason: 'Blocked by E2E network policy' }),
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
