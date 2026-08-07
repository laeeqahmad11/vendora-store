# End-to-end tests

Playwright starts Vite on `http://127.0.0.1:5173` with inert Firebase
configuration by default. This prevents the smoke suite from addressing the
Firebase project configured in `.env.local`. The shared fixture also blocks
browser requests to every origin except the configured application origin, so
Firebase and other third-party services cannot receive smoke-test traffic.

The current suite is intentionally read-only: it only loads public pages and
follows public links. It does not submit authentication, contact, newsletter,
checkout, or account forms.

Tests are organized by feature:

- `smoke/` contains public storefront checks.
- `auth/` contains public authentication-page checks.
- `customer/` is reserved for emulator-backed authenticated customer tests.
- `merchant/` is reserved for emulator-backed authenticated merchant tests.

Run against the isolated local Vite server:

```sh
npm run test:e2e
```

`PLAYWRIGHT_BASE_URL` may point the suite at a separately managed non-production
environment. Only use that override for an environment where read-only smoke
testing is explicitly safe.
