# Vendora — Multi-Vendor E-Commerce Platform

A production-grade, Shopify-inspired multi-vendor marketplace built with **React 19 + TypeScript + Vite + Tailwind CSS v4** on a full **Firebase** backend (Auth, Firestore, Storage, Hosting). One codebase hosts three role-based applications:

| Role | Route | What they get |
|---|---|---|
| **Customer** | `/` | Storefront, search & filters, product pages, cart, COD checkout, order tracking, account area |
| **Merchant** | `/merchant` | Store application → approval → full SaaS dashboard: products (with admin approval flow), inventory, orders & fulfilment, cash-received confirmation, discounts, promotions, reviews, analytics, settings |
| **Super Admin** | `/admin` | Platform overview, merchant approval, product approval queue, order monitoring, global catalog, users & roles, CMS, promotions, reports, activity logs, platform settings |

## Tech stack

React 19 · React Router v7 · TypeScript (strict) · Tailwind CSS v4 · Radix UI primitives (shadcn-style component kit) · TanStack Query · Zustand · React Hook Form + Zod · Framer Motion · Recharts · Fuse.js · react-dropzone · react-hot-toast · Day.js · Firebase v12

## Getting started

### 1. Install

```bash
npm install
```

### 2. Create a Firebase project

1. [console.firebase.google.com](https://console.firebase.google.com) → **Add project**
2. **Build → Authentication → Sign-in method**: enable **Email/Password** and **Google**
3. **Build → Firestore Database**: create database (production mode)
4. **Build → Storage**: get started
5. **Project settings → Your apps → Web app**: register an app and copy the config

### 3. Configure environment

```bash
cp .env.example .env.local
# paste your Firebase web-app config values
```

### 4. Deploy security rules & indexes

```bash
npm i -g firebase-tools
firebase login
firebase use <your-project-id>
firebase deploy --only firestore:rules,firestore:indexes,storage
```

### 5. Seed demo data (recommended)

The seed script uses the Admin SDK, so it needs a service-account key:

```bash
# Firebase Console → Project settings → Service accounts → Generate new private key
export GOOGLE_APPLICATION_CREDENTIALS=/path/to/serviceAccount.json
npm run seed
```

This creates categories, brands, 2 approved demo stores, 12 products (variants, flash sales, discounts), coupons (`WELCOME10`, `NOVA5`), banners, FAQs, CMS pages, a blog post, platform settings, and demo accounts:

| Account | Email | Password |
|---|---|---|
| Admin | `admin@vendora.dev` | `password123` |
| Merchant | `merchant1@vendora.dev` | `password123` |
| Merchant | `merchant2@vendora.dev` | `password123` |
| Customer | `customer@vendora.dev` | `password123` |

To elevate **your own** account to admin instead: sign up in the app first, then

```bash
npm run seed -- --admin-email you@example.com
```

### 6. Run

```bash
npm run dev
```

## Key workflows

### Merchant onboarding
Sign up → visit `/merchant` → submit store application → admin approves in `/admin/merchants` (owner's role is elevated to `merchant` automatically) → dashboard unlocks.

### Product approval
Merchant creates product (draft) → submits for review (`pending`) → admin approves/rejects with reason in `/admin/products` → only `approved` products appear in the storefront.

### Cash-on-delivery order lifecycle
```
pending → confirmed → packed → ready → dispatched → delivered → [merchant clicks "Cash received"] → completed
```
Every transition is timestamped in the order's timeline, written to the activity log, and pushed to the customer as a real-time notification. Customers can cancel while pending/confirmed and request returns after delivery. Only the order's merchant can confirm cash receipt (enforced by Firestore rules).

## Project structure

```
src/
  components/ui/        # shadcn-style component kit (Radix + Tailwind tokens)
  components/shared/    # ProductCard, SEO, ImageUploader, guards, error boundary…
  features/
    auth/               # login, register, forgot password, suspended
    storefront/         # landing, shop, product detail, cart, checkout, CMS pages
    customer/           # /account — profile, orders, addresses, wishlist, support…
    merchant/           # /merchant — application gate + full dashboard
    admin/              # /admin — platform management
  layouts/              # storefront shell + dashboard shell
  lib/                  # firebase init, constants, utils
  services/             # typed Firestore/Storage/Auth service layer
  stores/               # zustand: auth, cart, wishlist, theme, recently viewed
  types/                # domain model
firestore.rules          # role-based security rules
firestore.indexes.json   # composite indexes for all queries
storage.rules
scripts/seed.mjs         # demo data seeder (Admin SDK)
```

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Vite dev server |
| `npm run build` | Type-check + production build |
| `npm run preview` | Preview the production build |
| `npm run lint` | Lint (oxlint) |
| `npm run seed` | Seed demo data (needs `GOOGLE_APPLICATION_CREDENTIALS`) |

## Deploying

```bash
npm run build
firebase deploy --only hosting
```

## Notes & production hardening

- **Payments** are cash-on-delivery by design; there is no payment gateway.
- Counter updates (stock, soldCount, ratings) run client-side and are permitted by rules for the COD flow. For a hardened production deployment, move them to **Cloud Functions** triggers and tighten the corresponding rule clauses in `firestore.rules` (marked with comments).
- Search uses Fuse.js over the approved-product set (capped at 400 docs); swap in Algolia/Typesense for large catalogs.
- Emails (verification, reset) are sent by Firebase Auth. Transactional order emails would be a Cloud Function + SMTP provider.
