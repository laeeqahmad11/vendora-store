# End-to-end tests

The E2E runner builds the configured app with Vite, waits for Vite to exit, and
serves the build from memory on `http://127.0.0.1:5173` with inert Firebase
configuration by default. This prevents the public smoke suite from addressing
the Firebase project configured in `.env.local`. The shared fixture blocks
browser HTTP, HTTPS, and WebSocket traffic to every origin except the configured
application origin.

The E2E-only build emits one JavaScript bundle. This keeps the application and
its `React.lazy` route boundaries intact while avoiding an intermittent Windows
loopback/browser-middleware stall observed on later dynamic chunk requests.
Normal production builds keep their existing code-splitting configuration.

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
- `authenticated/wishlist.spec.ts` covers the current local-only wishlist model:
  public product-detail and product-card controls, authenticated account access,
  reload/navigation and logout/login persistence, toggle-based duplicate
  protection, removal, cross-surface state, move-to-cart semantics, and safe
  out-of-stock handling.
- `authenticated/reviews-ratings.spec.ts` covers the implemented product-page
  review workflow: authentication and validation gates, immediate publication,
  persisted review associations, rating/count aggregation, the currently
  allowed repeat-review behavior, customer/public consistency, merchant reply
  and status controls, admin deletion, and merchant cross-store UI isolation.
- `security/reviews.rules.node.mjs` uses direct Firebase clients against the
  local Firestore emulator to enforce approved-only public reads, strict review
  creates, author update/delete denial, merchant field and store isolation, and
  admin moderation/delete. Run it with `npm run test:security:reviews`.
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

Authenticated tests use the separate `playwright.auth.config.ts`. The E2E runner
directly owns the Firebase CLI, Vite build, localhost server, and Playwright
child processes. The build receives fake `demo-vendora-e2e` Firebase values and
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
fixtures, runs Playwright, and shuts the emulators down. Startup waits on the
emulator hub, every emulator listener, and the app HTTP endpoint rather than
fixed delays. Teardown asks the
Firebase CLI to cleanly stop its registered children, applies a bounded
process-tree fallback if needed, and fails if any managed localhost port remains
open.

Firestore and Storage emulator rule runtimes require Java 21 or newer. Install
the verified Eclipse Temurin runtime and version-pinned emulator binaries once:

```sh
npm run e2e:emulators:install
```

The Java runtime is stored under ignored `.firebase/java` instead of a temporary
directory, so subsequent shells find it automatically without changing the
machine PATH. This installation command is the only E2E command permitted to
download Java or emulator artifacts. Normal start/test commands disable Firebase
CLI update checks and analytics, block non-loopback CLI fetches, and refuse
implicit binary downloads.

For manual development:

```sh
npm run e2e:emulators
npm run e2e:seed
```

`e2e:reset` clears Auth, Firestore, and Storage emulator data without reseeding.
The seed/reset commands intentionally fail when the loopback emulators are not
running.
