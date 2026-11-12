# Tebu Drop

[![CI](https://github.com/project-contributors/tebu-opis/actions/workflows/ci.yml/badge.svg)](https://github.com/project-contributors/tebu-opis/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%E2%89%A520-green?logo=node.js&logoColor=white)](package.json)
[![Nuxt 3](https://img.shields.io/badge/Nuxt-3-00DC82?logo=nuxtdotjs&logoColor=white)](https://nuxt.com)
[![Prisma 7](https://img.shields.io/badge/Prisma-7-2D3748?logo=prisma&logoColor=white)](https://www.prisma.io)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)](tsconfig.json)

A mobile-first ordering, payment-verification and pickup-operations app for a
cold-pressed sugarcane juice service. Customers order Botol Kecik and Botol Besar from live
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
- Public ordering page with live per-variety cane stock (Botol Kecik / Botol Besar), capped daily capacity and Mon–Thu delivery selection.
- Bottom-sheet checkout (Reka UI / Vaul) with server-computed integer-sen totals and DuitNow QR payment.
- 20-minute price/inventory reservations with row-lock concurrency guarantees; expired reservations release stock automatically.
- Receipt upload (automatically compressed below 250 KB, with JPEG fallback for browsers without WebP encoding; verified and stored as WebP server-side with sharp).

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

If your local database uses the existing `tebu-postgres` Docker container, start
Docker Desktop, then run `bun run db:start` before `bun run dev`. The command
starts the existing container and preserves its database volume.

Prisma error `P1001` (`Can't reach database server at 127.0.0.1:5432`) means
the local PostgreSQL server is unavailable. Start the container, wait for
PostgreSQL to accept connections, then refresh the page. For a different local
PostgreSQL installation, start that service instead and check that
`NUXT_DATABASE_URL` matches its host and port.

The seed adds products, customers, orders across workflow stages, receipt and
freezer images, expenses, harvests and bottle stock. It preserves existing
records and prints sample customer bearer tokens and ticket links for local use.
Run `bun run db:seed:week` to add sample data from the upcoming Friday through
Saturday of the following week (nine dates, inclusive, using Malaysia time).
It includes 12 sample customers, eight orders per date across payment and packing
stages, two harvests, and nine expenses. Repeating the seed preserves existing
records, daily capacity, and calendar closures.

To replace all local development records with that sample set, run
`bun run db:reset:week`. This deletes customers, sessions, orders, media records,
schedules, expenses, harvests, products, and varieties before reseeding. Old
referenced local WebP uploads are removed after the database transaction succeeds;
remote R2 objects are retained. Reset refuses production mode and non-local
PostgreSQL hosts. The admin key and upload configuration in `.env` stay in place.
The storefront continues to show active-week weekdays; all nine seeded dates
are available in the admin calendar.
For production schedules use `npm run db:seed:schedules` (Mon–Thu dates,
current + next month, preserving closures and custom capacity).

### Daily bottle box

Each day has 12 shared spaces: a 500ml Botol Kecik uses 1 and a 1l Botol Besar
uses 2. Any mix fits while `kecik + 2 × besar <= capacity`: 12 Kecik, 6 Besar,
or 4 Kecik with 4 Besar all fill the box. The admin calendar has one capacity
setting in spaces; there are no independent bottle-size quotas.

The box in the week calendar shows bottles reserved across all customers for the
selected date. Each Besar spans two spaces; dotted slots show unused capacity.
Side counts show reserved spaces / capacity and
remaining spaces. The order limits below also account for the selected tebu’s
stock and the other bottle size already in the cart. Adding items to a cart does
not reserve a slot; starting payment does. Rejected and expired unpaid orders
release their slots. Availability refreshes every 15 seconds and on returning
to the tab. Starting checkout reserves spaces on a first-come basis under a
database lock, including simultaneous orders. The upgrade preserves custom
capacities and increases capacity where necessary to cover existing reservations.

### Temporary testing calendar

Set `NUXT_PUBLIC_TESTING_CALENDAR=true` in `.env` and restart the dev server to
show today and the next four consecutive Malaysia dates, including weekends.
Checkout accepts today within this five-day window; closed, removed, dropped,
and full dates still cannot accept new orders. Open dates through the admin
calendar as needed. Set the flag to `false` to restore the production weekly
calendar and future-weekday checkout rules. Production call sites are retained
in comments beside the testing branches.

### Configuration

| Variable | Required | Description |
| --- | --- | --- |
| `NUXT_DATABASE_URL` | DB mode | PostgreSQL connection string |
| `NUXT_ADMIN_KEY` | DB mode | Admin passkey — **≥ 32 random characters** |
| `NUXT_PUBLIC_DEMO` | always | `false` for production ordering |
| `NUXT_UPLOAD_DIR` | DB mode | Private uploads directory (Docker: `/app/data/uploads`) |
| `NUXT_PUBLIC_DUITNOW_QR` | optional | Payment QR image URL (defaults to `/qr/duitnow.jpeg`, served from `public/qr/duitnow.jpeg`) |
| `NUXT_PUBLIC_MERCHANT_NAME` | optional | Payment recipient display name (defaults to `Tebu Drop`) |
| `NUXT_PUBLIC_SUPPORT_WHATSAPP` | optional | Operator WhatsApp number for the pickup ticket's issue-report link, including country code (e.g. `60123456789`); blank hides the link |

All secrets stay server-side; only `.env.example` is committed.


### Packing and pantry operations

Pack at home lists each transaction with its customer, phone, items, total, payment and packed status. Details opens the traceable record and payment evidence; the separate receipt-review panel is removed. Pending-review orders must still be confirmed before packing. Packing saves an explicit boolean and is reflected on the public ticket as “Packed — awaiting pantry drop.”

Pantry drop combines collection progress and per-row WhatsApp buttons. Each button opens a message containing `/drop?t=<private-token>` so the customer can follow packing, pantry publication and pickup status. There is no sent-message queue or automatic delivery claim. Admin and ticket views refresh every five seconds and on returning to the tab; demo tabs also synchronize through storage events.

### Checkout and transaction history

The admin calendar's Transactions table filters by payment status across all pages, together with search and date filters. Select a row to review its receipt and open the customer ticket, edit or delete the transaction. WhatsApp and edit buttons are also available directly in each row. WhatsApp opens a prefilled message for the operator to send.

Select a payment badge to save a payment change directly. Manual paid/unpaid changes preserve packing and pickup status. For online orders, Paid confirms the order, Unpaid requests a fresh receipt with a 20-minute reservation, To review requires an attached receipt, and Rejected releases stock. Restoring a reservation checks daily capacity and stock; stale payment changes return a conflict. Deletion keeps its separate confirmation.

Checkout checks a complete phone number automatically. Unprotected profiles fill the saved name; protected profiles show a password prompt and fill it after unlocking, or immediately with a valid session cookie. Lookup creates no customer/session and does not renew expiry. The phone and last authenticated profile name are saved in localStorage for convenience; the database remains authoritative. An edited bag name is saved on that order without changing the profile name.

Orders support optional, multiline remarks (500 characters). Remarks are saved on the order, appear in payment confirmation, packing, admin tables/details, customer history and pickup tickets, and can be edited or cleared by an admin. Table previews show two lines; details and packing show the full text. Remarks are never reused for a new order. Apply migrations before running the updated server.

Checkout progresses through details → DuitNow payment → receipt upload → order ticket. The action button stays below the scrollable step content. The MAE screenshot is displayed through a QR-only viewport; its original pixels and payload are unchanged. Payment receipts remain private to the operator, and an order ticket is not proof that payment has been verified.

`/drop` displays a phone lookup and past-transactions table. A remembered number is checked automatically. After signing in, an HttpOnly, SameSite=Lax cookie remembers the customer for 30 minutes from sign-in, across reloads and tabs (Secure on HTTPS). Automatic lookup and polling do not extend the session. Passwords and live session tokens are never saved in browser storage. Lock history signs out immediately on shared devices; password changes revoke all previous sessions. Customers can opt into password protection during checkout, or add/change/remove it in history privacy settings. Without protection, anyone who knows the number can view its history. Private ticket links continue to act as bearer capabilities. There is no phone-ownership verification or password reset flow.

Apply `npm run db:migrate` before deploying the updated server to add `customers.password_hash` and the expiring `customer_sessions` table. Existing customer/order records are preserved; existing customers start without a history password.

### Cloudflare R2 uploads

Fill the `NUXT_R2_*` entries in `.env`, run `npm run storage:check` to verify upload/read/delete access, then set `NUXT_UPLOAD_STORAGE=r2` and restart the server. Required: account ID (or explicit S3 endpoint), access key ID, secret access key, and bucket name. The optional prefix defaults to `tebu/media`. Use an R2 Object Read & Write credential scoped to the bucket. All R2 credentials are server-only; no public bucket URL or browser CORS configuration is required. Keep real credentials in the ignored `.env` file; `.env.example` is a shared template.

Receipt/freezer uploads are compressed and verified before storage. The app reads private objects through `/api/media/:id`, retaining receipt authorization and published-photo checks. Existing local media and seed images remain readable after switching to R2. New R2 records store their object key in the existing media filename field; no schema migration is needed. Local storage stays enabled until you switch the driver. Actual Cloudflare connectivity must be checked after credentials are supplied.

R2 uploads use separate folders under `NUXT_R2_PREFIX`: `receipts/` for payment receipts and `drops/` for freezer photos (for example, `tebu/media/receipts/<id>.webp` and `tebu/media/drops/<id>.webp`). Existing keys remain readable. `npm run storage:organize` previews the moves for app-managed R2 images; add `-- --apply` to copy and verify each image, update its database key, then remove the original if no media records reference it. Media URLs stay unchanged, and a move journal is saved under `data/`.

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

### Upload a laptop order’s receipt from a phone

Under the payment QR or receipt chooser, select **Upload it from my phone**.
Scan the new QR with your phone camera to open a receipt-only page for that
order. Choose a bank receipt and submit it; the laptop checkout updates within
five seconds. The private upload link expires with the order’s reservation and
does not grant access to customer history. It is unavailable in device-local demo mode.

For local phone testing, run `bun run dev:lan` and keep both devices on the same
network. Open the app using the Network URL printed by Nuxt. If checkout is
opened through localhost, development upload QRs use the computer’s LAN address.
The ordinary `bun run dev` command only listens on the computer’s loopback address.

## Testing

```sh
npm test                  # domain: phones, integer pricing, schedules, calendars
npm run typecheck
npm run generate && node tests/server.mjs    # SSR + security guards smoke test
node tests/browser.mjs    # Playwright: full order → review → pack → drop → collect
bun run test:phone-receipt # isolated DB + browser: box, phone upload, expiry, local reset
npm run test:profile-remarks # throwaway Postgres + browser: profile lookup, passwords and order remarks
npm run test:box-capacity # throwaway Postgres + browser: shared spaces, mixed orders and races
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
- **Phone-based history with optional passwords.** Checkout remembers the normalized phone number in localStorage. Unprotected histories can be looked up with that number alone. Protected histories require a password; production passwords use salted scrypt hashes. Successful access issues a fixed 30-minute HttpOnly cookie session stored as a SHA-256 digest server-side. Enabling, changing or removing protection revokes previous sessions. Passwords are never stored in localStorage. Demo credentials use salted PBKDF2 hashes locally and only demonstrate the flow.
- **Capability links.** Pickup ticket URLs (`/drop?t=…`) are bearer capabilities: holders can view the ticket and confirm collection. Do not share them. Receipt access requires the admin key; freezer photos publish only after the operator dispatches.
- **Not included by design.** Phone-ownership verification, CSP (left to the operator's domain), automated payment verification, password recovery, retention cleanup jobs and multi-replica rate limiting are intentionally out of scope. See [SECURITY.md](SECURITY.md) for the full model and hardening checklist.
- **Scale assumption.** One Node replica; the in-process limiter (120 req/min per IP) is keyed on `X-Forwarded-For` behind proxies. Use a shared limiter before scaling out.

## Contributing

Contributions are welcome — read [CONTRIBUTING.md](CONTRIBUTING.md) for setup,
style rules and the verification checklist. Please report security issues
privately per [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE) © 2026 project-contributors

### Bottle product IDs

The bottle IDs are `kecik` (Botol Kecik, 500ml) and `besar` (Botol Besar, 1l). Run `npm run db:migrate` when upgrading an existing installation before starting the updated app. The rename migration updates historical carts and order items and renames stock and daily capacity columns, preserving quantities, checkout prices, and totals. Earlier migration files retain the original IDs so applied migration checksums remain valid. Browser-saved demo orders and harvests are converted when loaded.

Run `npm run test:product-rename` to verify the upgrade against historical records in a temporary database.
