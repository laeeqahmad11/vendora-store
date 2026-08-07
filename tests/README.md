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
