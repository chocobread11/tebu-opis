# Tebu Drop

[![CI](https://github.com/project-contributors/tebu-opis/actions/workflows/ci.yml/badge.svg)](https://github.com/project-contributors/tebu-opis/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%E2%89%A520-green?logo=node.js&logoColor=white)](package.json)
[![Nuxt 3](https://img.shields.io/badge/Nuxt-3-00DC82?logo=nuxtdotjs&logoColor=white)](https://nuxt.com)
[![Prisma 7](https://img.shields.io/badge/Prisma-7-2D3748?logo=prisma&logoColor=white)](https://www.prisma.io)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)](tsconfig.json)

A mobile-first ordering, payment-verification and pickup-operations app for a
cold-pressed sugarcane juice service. Customers order flasks and jugs from live
harvest inventory, pay via DuitNow QR, and pick up with a personal capability
ticket. Operators review payments, pack bags, publish freezer photos, dispatch
WhatsApp pickup messages and track revenue — all from a purpose-built console.

Same codebase, two deploy targets:

| Target | Command | Purpose |
| --- | --- | --- |
| **Node server** (Coolify / Docker) | `npm run build` | Production ordering with PostgreSQL |
| **Static demo** | `npm run generate` | Browser-local demo, no APIs, explicitly labelled DEMO |

## Features

**Storefront**
- Public ordering page with live per-variety cane stock (flask / jug), capped daily capacity and Mon–Thu delivery selection.
- Bottom-sheet checkout (Reka UI / Vaul) with server-computed integer-sen totals and DuitNow QR payment.
- 20-minute price/inventory reservations with row-lock concurrency guarantees; expired reservations release stock automatically.
- Receipt upload (client-oriented WebP ≤ 80 KB, re-validated and re-encoded server-side with sharp).

**Pickup experience**
- Per-order pickup ticket pages secured by 256-bit capability tokens (stored hashed server-side; server rejects caching and leaks referers).
- Freezer-proof photo publication gated on operator drop dispatch.
- Collection confirmation and full order history keyed to the customer token — never to the phone number alone.

**Operations console** (`/admin`, key-protected)
- Daily packing list of confirmed orders, plus today's pantry drop and pickup activity. The checklist auto-refreshes and rolls over at Malaysia-time midnight.
- One transaction table for drop status, collection and per-customer WhatsApp ticket links. WhatsApp opens a composer; opening it does not mark a message as sent.
- Month calendar: open/close dates, per-date bottle capacity, closures for MC/AL, and offline **manual orders** (paid/unpaid) that reserve stock without a checkout timeout. Its transaction history searches all dates, offers 10/25/50/100 rows per page, and supports editing and confirmed deletion. Edits retain original item prices and enforce stock and daily limits; deletion removes the ticket, items, and receipt metadata and releases stock.
- Financial log: revenue (all paid orders), expense and tebu-harvest CRUD; harvest output drives the live sellable bottle stock.

**Platform**
- Prisma 7 + PostgreSQL schema with migrations and repeatable seeds (schedule seed refuses to run under `NODE_ENV=production`).
- Strict TypeScript, Zod-validated endpoints, shadcn-vue-style component primitives, accessible dialogs and reduced-motion-safe transitions.
- Docker image: Node 22, non-root runtime user, `/api/health` container health check.
- Test pyramid: domain unit tests, server smoke tests, Playwright UI/UX suites, and full PostgreSQL integration tests.

## Getting started

### Quick demo (no database)

```sh
npm install
NUXT_PUBLIC_DEMO=true npm run dev
```

Everything runs in the browser: add bottles, complete a demo checkout with the
sample receipt, open **Admin**, confirm payment, pack, upload a freezer photo,
share the tokenized status ticket and collect. Demo records live in `localStorage`.
WhatsApp opens an external composer only when its button is explicitly clicked; the app never sends messages itself.

### Full stack

Requirements: Node ≥ 20, PostgreSQL, an admin key.

```sh
npm install
cp .env.example .env          # fill in the values below, then:
npm run db:migrate            # prisma migrate deploy
npm run db:seed               # sample data (skipped in production)
npm run dev
```

The seed adds products, customers, orders across workflow stages, receipt and
freezer images, expenses, harvests and bottle stock. It preserves existing
records and prints sample customer bearer tokens and ticket links for local use.
Run `npm run db:seed:week` to fill the current Malaysia ordering week with sample
orders across workflow stages, 12 customers, two harvests, and five expenses.
This repeatable development seed preserves existing orders, daily capacity, and
calendar closures; sample customers have no real phone numbers.
For production schedules use `npm run db:seed:schedules` (Mon–Thu dates,
current + next month, preserving closures and custom capacity).

### Configuration

| Variable | Required | Description |
| --- | --- | --- |
| `NUXT_DATABASE_URL` | DB mode | PostgreSQL connection string |
| `NUXT_ADMIN_KEY` | DB mode | Admin passkey — **≥ 32 random characters** |
| `NUXT_PUBLIC_DEMO` | always | `false` for production ordering |
| `NUXT_UPLOAD_DIR` | DB mode | Private uploads directory (Docker: `/app/data/uploads`) |
| `NUXT_PUBLIC_DUITNOW_QR` | optional | Payment QR image URL (defaults to `/qr/duitnow.jpeg`, served from `public/qr/duitnow.jpeg`) |
| `NUXT_PUBLIC_MERCHANT_NAME` | optional | Payment recipient display name (defaults to `Tebu Drop`) |

All secrets stay server-side; only `.env.example` is committed.


### Packing and pantry operations

Pack at home lists each transaction with its customer, phone, items, total, payment and packed status. Details opens the traceable record and payment evidence; the separate receipt-review panel is removed. Pending-review orders must still be confirmed before packing. Packing saves an explicit boolean and is reflected on the public ticket as “Packed — awaiting pantry drop.”

Pantry drop combines collection progress and per-row WhatsApp buttons. Each button opens a message containing `/drop?t=<private-token>` so the customer can follow packing, pantry publication and pickup status. There is no sent-message queue or automatic delivery claim. Admin and ticket views refresh every five seconds and on returning to the tab; demo tabs also synchronize through storage events.

### Checkout and transaction history

Checkout progresses through details → DuitNow payment → receipt upload → order ticket. The action button stays below the scrollable step content. The MAE screenshot is displayed through a QR-only viewport; its original pixels and payload are unchanged. Payment receipts remain private to the operator, and an order ticket is not proof that payment has been verified.

`/drop` displays a phone lookup and past-transactions table. A remembered number is checked automatically. Customers can opt into password protection during checkout, or add/change/remove it in history privacy settings. Without protection, anyone who knows the number can view its history. Private ticket links continue to act as bearer capabilities. There is no phone-ownership verification or password reset flow.

Apply `npm run db:migrate` before deploying the updated server to add `customers.password_hash` and the expiring `customer_sessions` table. Existing customer/order records are preserved; existing customers start without a history password.

### Cloudflare R2 uploads

Fill the `NUXT_R2_*` entries in `.env`, then set `NUXT_UPLOAD_STORAGE=r2` and restart the server. Required: account ID (or explicit S3 endpoint), access key ID, secret access key, and bucket name. The optional prefix defaults to `tebu/media`. Use an R2 Object Read & Write credential scoped to the bucket. All R2 credentials are server-only; no public bucket URL or browser CORS configuration is required.

Receipt/freezer uploads are compressed and verified before storage. The app reads private objects through `/api/media/:id`, retaining receipt authorization and published-photo checks. Existing local media and seed images remain readable after switching to R2. New R2 records store their object key in the existing media filename field; no schema migration is needed. Local storage stays enabled until you switch the driver. Actual Cloudflare connectivity must be checked after credentials are supplied.

See [Cloudflare’s S3 SDK guide](https://developers.cloudflare.com/r2/examples/aws/aws-sdk-js-v3/) and [R2 access-key setup](https://developers.cloudflare.com/r2/api/tokens/).

## Architecture

```
┌─────────────────────────────┐
│  Nuxt 3 SPA (Vue 3,         │
│  Tailwind, Reka/Vaul)       │
│  /  · /drop  ·  /admin/*    │
└──────────┬──────────────────┘
           │ /api/*  (Nitro server routes)
┌──────────▼──────────────────┐
│  Nitro API layer            │
│  Zod validation · bearer    │
│  auth · rate limiting ·     │
│  security headers           │
└─────┬───────────────┬───────┘
      │               │
┌─────▼─────┐  ┌──────▼──────────┐
│ Prisma 7  │  │ sharp pipeline  │
│ PostgreSQL│  │ private uploads │
└───────────┘  └─────────────────┘
```

| Page | API | Records |
| --- | --- | --- |
| `/` | `catalog`, `identity`, `orders`, `uploads` | Products, schedules, customers, orders, order items, receipts |
| `/drop` | `orders`, `orders/:token` | Customer history, pickup status, published freezer photos |
| `/admin` | `admin`, `uploads` | Orders, schedules, receipts, freezer photos |
| `/admin/calendar` | `admin/schedules`, `admin/orders` | Date capacity/closures, manual orders |
| `/admin/log` | `admin/logs`, `admin/logs/expenses`, `admin/logs/harvests` | Revenue, expenses, harvests, varieties, stock |

Domain rules live in `shared/domain.ts` (pricing defaults, Mon–Thu scheduling,
Malaysia-time ordering-week rollover at Sunday 00:00, phone normalization) and
back both the API and the seeds.

## Testing

```sh
npm test                  # domain: phones, integer pricing, schedules, calendars
npm run typecheck
npm run generate && node tests/server.mjs    # SSR + security guards smoke test
node tests/browser.mjs    # Playwright: full order → review → pack → drop → collect
npm run test:database     # throwaway Postgres: migrations, seeds, capacity races, receipts
npm run test:admin-transactions # throwaway Postgres + browser: archive search, edit/delete, daily packing
```

The database suite must run on a server where the role can create databases; it
creates, migrates, seeds, exercises and then destroys a temporary database and
uploads — including concurrency races and cross-reload persistence.

## Deployment (Coolify)

1. Create a PostgreSQL service on the private network; keep 5432 unexposed. Back up the database **and** uploads volume together.
2. The MAE QR image is served from `public/qr/duitnow.jpeg`, with `Tebu Drop` as the payment recipient display name. Replace that file to update the QR, or override `NUXT_PUBLIC_DUITNOW_QR` and `NUXT_PUBLIC_MERCHANT_NAME`. Verify it scans to the right account with a small end-to-end payment before opening orders. Demo mode continues to show a sample QR. Receipt verification is manual.
3. Set `.env.example` variables; never commit `.env`.
4. From a trusted runner with DB access: `npm run db:migrate && npm run db:seed:schedules`.
5. Deploy the Dockerfile on port 3000; mount a persistent volume at `/app/data/uploads` (UID 1000). Configure HTTPS and request body limits (300 KB) at your edge.
6. Check `/api/health` (process liveness, not DB readiness), sign in to `/admin`, verify receipt privacy and a real order round-trip.

The Docker build uses `npm ci` against the committed `package-lock.json`.

If retrofitting onto a database first created with the earlier Drizzle schema,
confirm it matches the `0_init` baseline and register it with
`prisma migrate resolve --applied 0_init` before deploying newer migrations.
Never reset a production database.

## Security model

- **Server-side truth.** All totals, prices, capacity and stock checks happen server-side; checkout saves per-line price snapshots so later price changes never rewrite history.
- **Phone-based history with optional passwords.** Checkout remembers the normalized phone number in localStorage. Unprotected histories can be looked up with that number alone. Protected histories require a password; production passwords use salted scrypt hashes. Successful access issues a 24-hour bearer session stored as a SHA-256 digest server-side. Enabling, changing or removing protection revokes previous sessions. Passwords are never stored in localStorage. Demo credentials use salted PBKDF2 hashes locally and only demonstrate the flow.
- **Capability links.** Pickup ticket URLs (`/drop?t=…`) are bearer capabilities: holders can view the ticket and confirm collection. Do not share them. Receipt access requires the admin key; freezer photos publish only after the operator dispatches.
- **Not included by design.** Phone-ownership verification, CSP (left to the operator's domain), automated payment verification, password recovery, retention cleanup jobs and multi-replica rate limiting are intentionally out of scope. See [SECURITY.md](SECURITY.md) for the full model and hardening checklist.
- **Scale assumption.** One Node replica; the in-process limiter (120 req/min per IP) is keyed on `X-Forwarded-For` behind proxies. Use a shared limiter before scaling out.

## Contributing

Contributions are welcome — read [CONTRIBUTING.md](CONTRIBUTING.md) for setup,
style rules and the verification checklist. Please report security issues
privately per [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE) © 2026 project-contributors
