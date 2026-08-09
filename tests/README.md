# End-to-end tests

Playwright starts Vite on `http://127.0.0.1:5173` with inert Firebase
configuration by default. This prevents the public smoke suite from addressing
the Firebase project configured in `.env.local`. The shared fixture blocks
browser HTTP, HTTPS, and WebSocket traffic to every origin except the configured
application origin.

The current suite is intentionally read-only: it only loads public pages and
follows public links. It does not submit authentication, contact, newsletter,
checkout, or account forms.

Tests are organized by feature:

- `smoke/` contains public storefront checks.
- `auth/` contains public authentication-page checks.
- `authenticated/` contains emulator-backed role access checks.
- `authenticated/merchant-products.spec.ts` covers the approved merchant's
  product lifecycle from an empty catalog through draft, edit, and pending
  review. It resets Firestore and Storage and reseeds deterministic documents
  before each attempt while preserving the authenticated emulator users, so
  deterministic names and SKUs remain retry-safe.
- `authenticated/product-approval.spec.ts` continues that same UI lifecycle
  across merchant, admin, and signed-out public contexts: admin approval,
  merchant Approved status, and public store/product visibility.
- `authenticated/customer-order.spec.ts` places a deterministic COD order and
  verifies customer, merchant, inventory, and admin visibility.
- `authenticated/checkout-stock-edge.spec.ts` covers out-of-stock and limited
  quantity controls, cart removal, exact-once last-unit checkout, success-flow
  reload/revisit behavior, cross-role visibility, stale-cart rejection, and
  atomic rejection when one item in a multi-item checkout becomes unavailable.
- `authenticated/merchant-order-fulfillment.spec.ts` advances that real order
  through every merchant fulfillment action (confirmed, packed, ready,
  dispatched, delivered, and COD completion), checking customer/admin status,
  timestamped timelines, audit activity, and unchanged post-checkout inventory
  after every transition.
- `authenticated/order-cancellation.spec.ts` cancels a real pending COD order
  through the customer UI, checks exact stock and Sold restoration, verifies the
  cancellation timeline and audit activity, and confirms the final state across
  customer, merchant, inventory, and admin views.
- `authenticated/merchant-order-cancellation.spec.ts` cancels real pending and
  confirmed COD orders through the merchant UI, verifies the required reason,
  exact-once stock and Sold restoration, blocked post-cancellation actions, and
  the final customer, merchant, inventory, and admin views.
- `auth.setup.ts` signs in once per role and writes ignored storage states to
  `tests/.auth/`.

Run against the isolated local Vite server:

```sh
npm run test:e2e
```

`PLAYWRIGHT_BASE_URL` may point the suite at a separately managed non-production
environment. Only use that override for an environment where read-only smoke
testing is explicitly safe.

## Authenticated emulator tests

Authenticated tests use the separate `playwright.auth.config.ts`. Its Vite
server receives fake `demo-vendora-e2e` Firebase values and
`VITE_USE_EMULATORS=true`; it never loads production Firebase values from
`.env.local`. For this config, the browser allowlist is exactly:

- `http://127.0.0.1:5173` (Vite)
- `http://127.0.0.1:9099` (Auth emulator)
- `http://127.0.0.1:8080` (Firestore emulator)
- `http://127.0.0.1:9199` (Storage emulator)

All other browser HTTP, HTTPS, and WebSocket origins are blocked, and service
workers are disabled so they cannot bypass Playwright routing.

Run the complete reset, seed, login-state setup, and authenticated checks:

```sh
npm run test:e2e:auth
```

The command starts the three emulators with the explicit
`demo-vendora-e2e` project, resets all emulator data, seeds deterministic role
fixtures, runs Playwright, and shuts the emulators down.

Firestore and Storage emulator rule runtimes require Java 21 or newer. Install
Java and make `java` available on `PATH`. Then download the version-pinned
emulator binaries once:

```sh
npm run e2e:emulators:install
```

This installation command is the only E2E command permitted to download
emulator artifacts. Normal start/test commands disable Firebase CLI update
checks and analytics, block non-loopback CLI fetches, and refuse implicit
binary downloads.

For manual development:

```sh
npm run e2e:emulators
npm run e2e:seed
```

`e2e:reset` clears Auth, Firestore, and Storage emulator data without reseeding.
The seed/reset commands intentionally fail when the loopback emulators are not
running.
