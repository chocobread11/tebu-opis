# Tebu Drop

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%E2%89%A520-green?logo=node.js&logoColor=white)](package.json)
[![Nuxt 4](https://img.shields.io/badge/Nuxt-3-00DC82?logo=nuxtdotjs&logoColor=white)](https://nuxt.com)
[![Prisma 7](https://img.shields.io/badge/Prisma-7-2D3748?logo=prisma&logoColor=white)](https://www.prisma.io)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)](tsconfig.json)

A mobile-first ordering, payment-verification and pickup-operations app for a
cold-pressed sugarcane juice service. Customers order Botol Kecik and Botol Besar from live
product inventory, pay via DuitNow QR, and pick up with a personal capability
ticket. Operators review payments, pack bags, publish freezer photos, dispatch
WhatsApp pickup messages and track revenue — all from a purpose-built console.

Same codebase, two deploy targets:

| Target | Command | Purpose |
| --- | --- | --- |
| **Node server** (Coolify / Docker) | `npm run build` | Production ordering with PostgreSQL |
| **Static demo** | `npm run generate` | Browser-local demo, no APIs, explicitly labelled DEMO |

## Features

**Storefront**
- Public ordering page with four independently stocked tebu products (two varieties × two sizes), capped daily capacity and Mon–Thu delivery selection.
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
- Financial log: revenue (all paid orders), expense tracking and an editable product restock table; restocks drive sellable stock.

**Platform**
- Prisma 7 + PostgreSQL schema with migrations and repeatable seeds (sample-data seeds refuse to run under `NODE_ENV=production`; schedule-only seeding is supported).
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
stages, four restocks, and nine expenses. Repeating the seed preserves existing
records, daily capacity, and calendar closures.

To replace all local development records with that sample set, run
`bun run db:reset:week`. This deletes customers, sessions, orders, media records,
schedules, expenses, harvests, products, varieties, refunds, and audit history before reseeding. Old
referenced local WebP uploads are removed after the database transaction succeeds;
remote R2 objects are retained. Reset refuses production mode and non-local
PostgreSQL hosts. The admin key and upload configuration in `.env` stay in place.
The storefront continues to show active-week weekdays; all nine seeded dates
are available in the admin calendar.
For production schedules use `npm run db:seed:schedules` (Mon–Thu dates,
current + next month, preserving closures and custom capacity).

### Products and inventory

Open **Products** (`/admin/products`) to manage the menu without editing code.
Main products and condiments have separate sections. Add a name, unit/size,
price, description, image, box-space cost and stock settings. Images are verified,
compressed and stored in the configured R2 `products/` folder. Use the public-menu
checkbox to archive an item; existing orders and their item snapshots remain intact.

Use **Restock** or **Log stock** to record a product, date, quantity and optional
note. Stock is reserved when checkout starts and released by expiry, rejection or
deletion. Each product has independent stock shared across delivery dates. Main products need at least one box space; condiments may use zero.

The four tebu products are Tebu 1 · Kecik, Tebu 1 · Besar, Tebu 2 · Kecik,
and Tebu 2 · Besar. Customers can mix all four in one order. Restock a product
with a date, quantity and optional note; the restock log retains each entry.
Sold-out products stay visible with faded images and disabled quantity controls.
Existing harvest quantities are migrated once into the editable restock ledger;
the restock screen shows their bottle counts as opening stock. The original
harvest records remain stored; kg details are omitted from the interface.
Expenses are managed separately at `/admin/finance`. `/admin/log` redirects to Products. Run `npm run db:migrate`
before starting the updated server. Historical line prices, quantities, sizes,
box-space costs and totals are preserved when the old variety-based stock splits.

Apply `npm run db:migrate` before starting the updated server. The migration
preserves orders, prices, quantities, harvests and expenses, and snapshots product
names, units, categories and space costs on order items. Later catalog edits affect
new purchases; old order receipts and reservations keep their original details.

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
| `NUXT_PUBLIC_DUITNOW_QR` | optional | Configure your payment QR URL separately; blank disables live checkout. Personal payment assets are not included in this repository. |
| `NUXT_PUBLIC_MERCHANT_NAME` | optional | Payment recipient display name (defaults to `Tebu Drop`) |
| `NUXT_PUBLIC_SUPPORT_WHATSAPP` | optional | Operator WhatsApp number for the pickup ticket's issue-report link, including country code (e.g. `60123456789`); blank hides the link |

All secrets stay server-side; only `.env.example` is committed.


### Packing and pantry operations

Pack at home lists each transaction with its customer, phone, items, total, payment and packed status. Details opens the traceable record and payment evidence; the separate receipt-review panel is removed. Pending-review orders must still be confirmed before packing. Packing saves an explicit boolean and is reflected on the public ticket as “Packed — awaiting pantry drop.”

Pantry drop combines collection progress and per-row WhatsApp buttons. Each button opens a message containing `/drop?t=<private-token>` so the customer can follow packing, pantry publication and pickup status. There is no sent-message queue or automatic delivery claim. Admin and ticket views refresh every five seconds and on returning to the tab; demo tabs also synchronize through storage events.

### Checkout and transaction history

Order references such as `#A12` use a shared database sequence across all delivery dates and both customer and manual orders. Existing references stay unchanged, including historical repeats from the old daily numbering. Moving an order to another delivery date keeps its reference; deleting an order never resets the counter. Retried checkout requests return the original order. Gaps are expected when a transaction fails after reserving a number. Apply `npm run db:migrate` before starting the updated server.

The admin calendar's Transactions table filters by payment status across all pages, together with search and date filters. Select a row to review its receipt and open the customer ticket, edit or delete the transaction. WhatsApp and edit buttons are also available directly in each row. WhatsApp opens a prefilled message for the operator to send.

Select a payment badge to save a payment change directly. Manual paid/unpaid changes preserve packing and pickup status. For online orders, Paid confirms the order, Unpaid requests a fresh receipt with a 20-minute reservation, To review requires an attached receipt, and Rejected releases stock. Restoring a reservation checks daily capacity and stock; stale payment changes return a conflict. Deletion keeps its separate confirmation.

Checkout needs only a phone number and bag name; a forgotten history password never blocks a new order. Lookup fills unprotected names, or protected names when a matching history session is already signed in. Otherwise the customer enters a name for this order. The profile name and history password are unchanged. Phone and entered bag name are remembered in localStorage; passwords and session tokens are not.

A separate HttpOnly checkout cookie authorizes orders created in that browser session and their receipt uploads, including phone upload links. It cannot read protected history, change its password, retrieve older orders through request retries, or authorize another device’s orders. Starting another checkout renews this checkout session for 30 minutes without renewing the fixed history sign-in. Existing authenticated API clients retain their customer-token flow.

Orders support optional, multiline remarks (500 characters). Remarks are saved on the order, appear in payment confirmation, packing, admin tables/details, customer history and pickup tickets, and can be edited or cleared by an admin. Table previews show two lines; details and packing show the full text. Remarks are never reused for a new order. Apply migrations before running the updated server.

Checkout progresses through details → DuitNow payment → receipt upload → order ticket. The action button stays below the scrollable step content. Supply an image containing only the payment QR through private deployment configuration; no personal screenshot is bundled. Payment receipts remain private to the operator, and an order ticket is not proof that payment has been verified.

`/drop` displays a phone lookup and past-transactions table. A remembered number is checked automatically. After signing in, an HttpOnly, SameSite=Lax cookie remembers the customer for 30 minutes from sign-in, across reloads and tabs (Secure on HTTPS). Automatic lookup and polling do not extend the session. Passwords and live session tokens are never saved in browser storage. Lock history signs out immediately on shared devices; password changes revoke all previous history sessions. Customers can add/change/remove password protection in history privacy settings. New checkout never asks for a history password. Without protection, anyone who knows the number can view its history. Private ticket links continue to act as bearer capabilities. Phone ownership is verified manually by the operator for password recovery; use Customer recovery to issue a one-time reset link.

Apply `npm run db:migrate` before deploying the updated server to add `customers.password_hash` and the expiring `customer_sessions` table. Existing customer/order records are preserved; existing customers start without a history password.

### Cloudflare R2 uploads

`NUXT_R2_ENDPOINT` is the API origin, for example `https://<account>.r2.cloudflarestorage.com`. Set `NUXT_R2_BUCKET` to the bucket name only. The storage adapter trims pasted whitespace and removes the bucket path from Cloudflare endpoint URLs.

Fill the `NUXT_R2_*` entries in `.env`, run `npm run storage:check` to verify upload/read/delete access, then set `NUXT_UPLOAD_STORAGE=r2` and restart the server. Required: account ID (or explicit S3 endpoint), access key ID, secret access key, and bucket name. The optional prefix defaults to `tebu/media`. Use an R2 Object Read & Write credential scoped to the bucket. All R2 credentials are server-only; no public bucket URL or browser CORS configuration is required. Keep real credentials in the ignored `.env` file; `.env.example` is a shared template.

Receipt/freezer uploads are compressed and verified before storage. The app reads private objects through `/api/media/:id`, retaining receipt authorization and published-photo checks. Existing local media and seed images remain readable after switching to R2. New R2 records store their object key in the existing media filename field; no schema migration is needed. Local storage stays enabled until you switch the driver. Actual Cloudflare connectivity must be checked after credentials are supplied.

R2 uploads use separate folders under `NUXT_R2_PREFIX`: `receipts/` for payment receipts, `drops/` for freezer photos, and `products/` for menu images (for example, `tebu/media/receipts/<id>.webp` and `tebu/media/drops/<id>.webp`). Existing keys remain readable. `npm run storage:organize` previews the moves for app-managed R2 images; add `-- --apply` to copy and verify each image, update its database key, then remove the original if no media records reference it. Media URLs stay unchanged, and a move journal is saved under `data/`.

See [Cloudflare’s S3 SDK guide](https://developers.cloudflare.com/r2/examples/aws/aws-sdk-js-v3/) and [R2 access-key setup](https://developers.cloudflare.com/r2/api/tokens/).

## Architecture

```
┌─────────────────────────────┐
│  Nuxt 4 SPA (Vue 3,         │
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
| `/admin/finance` | `admin/logs`, `admin/logs/expenses` | Revenue and expenses |

Domain rules live in `shared/domain.ts` (pricing defaults, Mon–Thu scheduling,
Malaysia-time ordering-week rollover at Sunday 00:00, phone normalization) and
back both the API and the seeds.

### Upload a laptop order’s receipt from a phone

The payment amount appears above the bank QR, with a **Download payment QR** button. The order tag identifies the ticket; this checkout does not require it as a bank reference. Pay the amount shown and submit the receipt for review.

Under the payment QR or receipt chooser, select **Using a laptop? Upload from your phone**.
Scan the upload QR with your phone camera, open the link, or copy it to your phone. Each order has its own `/receipt/<unique-order-code>#<upload-credential>` page; the credential stays out of server request URLs. Legacy `/receipt?t=…#…` links still work. Choose a bank receipt and submit it; the laptop checkout updates within
five seconds. The private upload link expires with the order’s reservation and
does not grant access to customer history. It is unavailable in device-local demo mode.

For local phone testing, run `bun run dev:lan` and keep both devices on the same
network. Open the app using the Network URL printed by Nuxt. If checkout is
opened through localhost, development upload QRs use the computer’s LAN address.
The ordinary `bun run dev` command only listens on the computer’s loopback address, which a phone cannot reach. No separate service, login, or page setup is required on a deployed site. Phone links normally use the public request origin (including proxy forwarding headers). If your deployment exposes an internal host, set `NUXT_SITE_URL=https://your-public-domain` and restart the app; this is optional on direct deployments.

## Testing

```sh
npm test                  # domain: phones, integer pricing, schedules, calendars
npm run typecheck
npm run build             # server build used by the flow tests
node tests/server.mjs     # SSR + security guards smoke test
npm run test:flows        # complete maintained database and browser matrix
node tests/browser.mjs    # Playwright: full order → review → pack → drop → collect
bun run test:phone-receipt # isolated DB + browser: box, phone upload, expiry, local reset
npm run test:products-inventory # isolated DB + S3/browser: dynamic menu, restocks and checkout
npm run test:checkout-access # throwaway Postgres: password-free checkout and history isolation
npm run test:profile-remarks # throwaway Postgres + browser: profile lookup, passwords and order remarks
npm run test:box-capacity # throwaway Postgres + browser: shared spaces, mixed orders and races
npm run test:database     # throwaway Postgres: migrations, seeds, capacity races, receipts
npm run test:admin-transactions # throwaway Postgres + browser: archive search, edit/delete, daily packing
```

The database suite must run on a server where the role can create databases; it
creates, migrates, seeds, exercises and then destroys a temporary database and
uploads — including concurrency races and cross-reload persistence.

## Deployment (Coolify)

Use the production Compose setup and release procedure in [DEPLOYMENT.md](DEPLOYMENT.md). It includes an always-running Node app, private PostgreSQL, a mandatory backup/migration job, encrypted R2 backups, restore commands, production configuration checks, and the final HTTPS launch check.

The app refuses production startup with the testing calendar, demo mode, LAN/placeholder website URLs, weak admin keys or incomplete R2 credentials. Configure the real HTTPS domain in `.env.production` and any saved Admin Settings override. Keep the development `.env` separate. Production seeding initializes schedules only and preserves existing records.

The Docker build uses `npm ci` against the committed `package-lock.json`.

If retrofitting onto a database first created with the earlier Drizzle schema,
confirm it matches the `0_init` baseline and register it with
`prisma migrate resolve --applied 0_init` before deploying newer migrations.
Never reset a production database.

## Security model

- **Server-side truth.** All totals, prices, capacity and stock checks happen server-side; checkout saves per-line price snapshots so later price changes never rewrite history.
- **Phone-based history with optional passwords.** Checkout remembers the normalized phone number in localStorage. Unprotected histories can be looked up with that number alone. Protected histories require a password; production passwords use salted scrypt hashes. Successful access issues a fixed 30-minute HttpOnly cookie session stored as a SHA-256 digest server-side. Enabling, changing or removing protection revokes previous sessions. Passwords are never stored in localStorage. Demo credentials use salted PBKDF2 hashes locally and only demonstrate the flow.
- **Capability links.** Pickup ticket URLs (`/drop?t=…`) are bearer capabilities: holders can view the ticket and confirm collection. Do not share them. Receipt access requires the admin key; freezer photos publish only after the operator dispatches.
- **Not included by design.** Phone-ownership verification, CSP (left to the operator's domain), automated payment verification, retention cleanup jobs and multi-replica rate limiting are intentionally out of scope. See [SECURITY.md](SECURITY.md) for the full model and hardening checklist.
- **Scale assumption.** One Node replica; the in-process limiter (separate read, checkout, admin-write and authentication budgets per IP/session) is keyed on `X-Forwarded-For` behind proxies. Use a shared limiter before scaling out.

## Contributing

Contributions are welcome — read [CONTRIBUTING.md](CONTRIBUTING.md) for setup,
style rules and the verification checklist. Please report security issues
privately per [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE) © 2026 Project contributors

### Bottle product IDs

The four bottle IDs are `kecik` and `besar` for Tebu 1, and `tebu-2-kecik` and `tebu-2-besar` for Tebu 2. Each size has independent stock. Run `npm run db:migrate` when upgrading an existing installation before starting the updated app. The rename migration updates historical carts and order items and renames stock and daily capacity columns, preserving quantities, checkout prices, and totals. Earlier migration files retain the original IDs so applied migration checksums remain valid. Browser-saved demo orders and harvests are converted when loaded.

Run `npm run test:product-rename` to verify the upgrade against historical records in a temporary database.

### Product images and WhatsApp messages

Run `npm run storage:products -- --apply` to copy existing product photos into the
configured private R2 bucket. The command verifies each uploaded image before
linking it to the product, preserves local source files, and skips images already
in R2. Product edit dialogs preview the current image before you choose a replacement.

The restock table supports search, product filtering, 10/20/50/100 rows per page,
and Previous/Next navigation. Editing a dated entry updates inventory by the difference.

Use **Settings → WhatsApp message** to edit the saved message opening. `{name}` inserts the customer name and `{tag}` inserts the order number.
The application always appends the existing customer ticket URL separately.

Development commands regenerate Prisma before starting Nuxt. Changes to the
generated Prisma runtime trigger a Nuxt restart so newly added models are
available immediately. Run `npm run test:prisma-dev-reload` against a running
dev server to check the admin endpoints and generated-client reload behavior.


### Order corrections and recovery

Collected orders retain their original items, date and fulfilment record. Use
**Record refund** in transaction details after returning money manually; this
records the amount and reason, reduces net revenue, and does not send money.
A full refund can cancel an uncollected order and release its reservation.
Use a separate signed **Adjust stock** entry with a reason for physical returns,
breakage or corrections. Restock entries continue to add whole bottles.
Manual orders may be collected while unpaid; mark their payment paid afterward.

Expired checkout reservations show their expiry and stop accepting receipts.
If a customer already paid, the operator can **Reopen receipt upload** on an
available delivery date and copy a private link valid for another 20 minutes.
Checkout retries reuse a request ID, and refreshing a protected customer's
checkout preserves that session's tickets without unlocking their full history.

For a forgotten history password, use **Customer recovery** on Calendar. Verify the customer through their existing WhatsApp contact, then
create and share the private recovery link manually. It expires after 30 minutes
and works once; issuing another invalidates the previous link. Resetting preserves
orders and revokes previous history sessions. No SMS service is required.

**Change history** records dated before/after changes to orders, payments,
refunds, stock, products, schedules, expenses and settings. Passwords and access
credentials are excluded. History starts when this migration is installed;
earlier edits cannot be reconstructed.

Run `npm run db:migrate` before starting the upgraded app. `npm run test:flows`
builds on the current server output (`npm run build` first) and runs database,
browser, recovery and migration suites against disposable databases. CI runs
these flows plus type checking, unit tests, and server/static builds. The legacy
`test:database` and browser entry points now delegate to the maintained suites.
The testing calendar remains controlled by `NUXT_PUBLIC_TESTING_CALENDAR`;
finish acceptance testing before disabling it.


Storefront images use fixed-size placeholders and a short fade after decoding.
The hero is preloaded, the first two products load eagerly, and remaining photos
load as they approach the viewport. Published product photos have a one-day
browser/CDN cache keyed by their immutable media ID; replacing a photo creates a
new URL. Private receipts and admin image responses remain uncached.


### Telegram alerts for customer orders

One Telegram alert is sent when a customer submits their payment receipt,
including returning customers. Checkout creation and selecting/uploading a file
alone do not send alerts. Manual orders and unrelated edits stay excluded. A
replacement receipt submitted after rejection generates a new review alert;
retrying submission of the same receipt does not. Unsent legacy checkout alerts
are ignored. Alerts show the order tag, customer name, items, amount, delivery
date and remarks, with **Awaiting your review**. They do not confirm payment.

Set the **Website URL** in Admin Settings to the public HTTPS origin to include **Order ticket** and
**Review receipt** links. The review link opens the exact transaction and receipt
after admin sign-in, even if the order is outside the table's current page.
The browser remembers admin sign-in for a fixed 12 hours across reloads and new
tabs, so subsequent links open the receipt directly in that browser. The admin
key is cleared after login; a separate HttpOnly session cookie authenticates
requests. Use **Sign out** to revoke it. Other devices, an expired session, or a
changed admin key require signing in again. The customer ticket is a capability
link; keep your Telegram chat private. Private
receipt files still require admin authentication.

The 20-minute timer is for the customer to submit their receipt, not for the
operator to approve it. Once submitted, stock and space stay reserved while
awaiting review, even after that timer expires.

1. Create a dedicated bot through [@BotFather](https://t.me/BotFather).
2. Put its token in the server's `.env` as `NUXT_TELEGRAM_BOT_TOKEN`.
3. Open your bot in Telegram and tap **Start** or send `/start`.
4. Run `npm run telegram:chats`, then enter the chat ID in **Admin Settings** and
   enable Telegram receipt alerts. `NUXT_TELEGRAM_CHAT_ID` remains an optional
   initial fallback.
5. Apply migrations with `npm run db:migrate` and restart after installing this
   upgrade. On Coolify, add the bot token to the service's runtime environment.
   Later chat ID, on/off, message and website changes use Settings without a restart.

For a local phone test, run `bun run dev:lan` and set the Settings website URL to
the printed LAN address (for example `http://192.168.1.23:3000`). Your phone must be
on the same Wi-Fi. HTTP notification links to private LAN addresses are allowed
only in development; deployed builds continue to require HTTPS.

The bot token stays in server configuration; the chat ID is stored in protected
shop settings. No incoming webhook or public bot endpoint is
needed: delivery uses Telegram's
[sendMessage API](https://core.telegram.org/bots/api#sendmessage).
Use the Settings toggle to disable alerts. A missing server bot token also
disables delivery. Demo mode never sends alerts.

Each alert is saved in the same transaction as receipt submission and delivered in the background, independently of the response. A
unique order/receipt key prevents duplicate alerts from resubmitting the same
receipt. A replacement receipt has its own event key. Failed deliveries use backoff,
honor rate-limit retry delays, and resume after server restarts. Delivery state
and safe errors remain in `telegram_notifications`. If Telegram accepts a
message but the response is lost, retrying can produce a duplicate; the order
tag identifies it. Receipts submitted while notifications are disabled are not
backfilled. The app server must be running for background delivery.

Run `npm run test:telegram` after a server build to verify delivery, retries,
restart recovery, receipt-review links, remembered admin sign-in, delayed
approval, and manual-order exclusion against a mock Telegram server.


Browser admin sign-in uses a random 256-bit session token stored only in an
HttpOnly/SameSite=Lax cookie, marked Secure on HTTPS. Only its digest and the
configured key's digest are stored server-side. Expiry is fixed at 12 hours;
requests do not extend it. Signing out revokes that session, and key rotation
invalidates existing sessions. The admin key is never placed in a Telegram URL
or browser storage. API clients can continue using the bearer key. These cookie
settings follow the [OWASP session guidance](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html#cookies).


### Admin Settings

Open **Settings** in admin navigation to edit the merchant display name, support
WhatsApp number, WhatsApp message opening, Telegram on/off and chat ID, and the
website origin used for new Telegram, receipt-upload and recovery links.
Updates are validated, saved in PostgreSQL and recorded in Change history.
Saved values override environment defaults; blank optional fields intentionally
clear the value. Existing WhatsApp templates are preserved during the upgrade.

Storefront pages receive only the merchant display name and support number.
They pick up saved values on navigation or their availability refresh. Merchant
name changes affect the payment label, not the account encoded in the payment QR.
The Telegram worker reads current settings before each dispatch, so a new chat
or enabled state takes effect without restarting. Pending deliveries pause while
disabled; receipts submitted while disabled are not backfilled. Already-delivered
messages keep their original links.

Database/R2 credentials, the admin key, bot token and testing-calendar flag stay
in server configuration. Opening Settings does not modify existing values. The
WhatsApp editor is now on this page; Customer recovery stays on Calendar.
Each product's **Add stock** button starts restocks or adjustments. The stock
history heading has no duplicate entry buttons. Preview Settings save locally
on that device and never send Telegram messages.

Run `npm run test:settings` after a server build to check validation, isolation,
immediate public changes, link origins, UI layout, audit records and persistence.
