# Tebu Drop

[![CI](https://github.com/chocobread11/tebu-opis/actions/workflows/ci.yml/badge.svg)](https://github.com/chocobread11/tebu-opis/actions/workflows/ci.yml)
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
- Packing and pantry-drop checklist that auto-refreshes and rolls over at Malaysia-time midnight.
- WhatsApp dispatch preview per customer, with explicit "I've sent it" confirmation — the app never sends messages itself.
- Month calendar: open/close dates, per-date bottle capacity, closures for MC/AL, and offline **manual orders** (paid/unpaid) that reserve stock without a checkout timeout.
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
preview the WhatsApp message and collect. Demo records live in `localStorage`;
demo WhatsApp previews never contact real numbers.

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
For production schedules use `npm run db:seed:schedules` (Mon–Thu dates,
current + next month, preserving closures and custom capacity).

### Configuration

| Variable | Required | Description |
| --- | --- | --- |
| `NUXT_DATABASE_URL` | DB mode | PostgreSQL connection string |
| `NUXT_ADMIN_KEY` | DB mode | Admin passkey — **≥ 32 random characters** |
| `NUXT_PUBLIC_DEMO` | always | `false` for production ordering |
| `NUXT_UPLOAD_DIR` | DB mode | Private uploads directory (Docker: `/app/data/uploads`) |
| `NUXT_PUBLIC_DUITNOW_QR` | production | Path to your real merchant QR image |
| `NUXT_PUBLIC_MERCHANT_NAME` | optional | Merchant display name |

All secrets stay server-side; only `.env.example` is committed.

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
```

The database suite must run on a server where the role can create databases; it
creates, migrates, seeds, exercises and then destroys a temporary database and
uploads — including concurrency races and cross-reload persistence.

## Deployment (Coolify)

1. Create a PostgreSQL service on the private network; keep 5432 unexposed. Back up the database **and** uploads volume together.
2. Put the real merchant DuitNow QR at `public/duitnow-qr.png` and verify it scans to the right account with a small end-to-end payment before opening orders.
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
- **Tokens, not accounts.** Normalized phone numbers identify records; 256-bit bearer tokens authorize access and are stored only as SHA-256 digests. A phone number alone cannot retrieve someone's data. Changing devices requires operator-assisted recovery.
- **Capability links.** Pickup ticket URLs (`/drop?t=…`) are bearer capabilities: holders can view the ticket and confirm collection. Do not share them. Receipt access requires the admin key; freezer photos publish only after the operator dispatches.
- **Not included by design.** Phone-ownership verification, CSP (left to the operator's domain), automated payment verification, self-service token reset, retention cleanup jobs and multi-replica rate limiting are intentionally out of scope. See [SECURITY.md](SECURITY.md) for the full model and hardening checklist.
- **Scale assumption.** One Node replica; the in-process limiter (120 req/min per IP) is keyed on `X-Forwarded-For` behind proxies. Use a shared limiter before scaling out.

## Contributing

Contributions are welcome — read [CONTRIBUTING.md](CONTRIBUTING.md) for setup,
style rules and the verification checklist. Please report security issues
privately per [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE) © 2026 chocobread11
