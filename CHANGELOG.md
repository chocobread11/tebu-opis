# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [1.0.0] - 2026-11-01

First public release.

### Added

- Storefront ordering page with per-variety cane stock, quantity controls and a
  bottom-sheet checkout (Reka UI / Vaul).
- DuitNow QR payment flow with 20-minute reservations, receipt upload and
  operator payment review.
- Pickup tickets (`/drop?t=…`) with payment status, freezer photo publication
  and collection confirmation.
- Operations console: packing/pantry checklist, WhatsApp dispatch preview,
  month calendar with per-date capacity and closures, and manual (offline)
  orders.
- Financial log: revenue, expenses and tebu harvest records feeding live bottle
  inventory.
- PostgreSQL data model via Prisma 7 with migrations and repeatable seeds.
- Static browser-local demo build (`NUXT_PUBLIC_DEMO=true` / `npm run generate`).
- Docker image for Node deployments with health check and non-root runtime user.
- Test suites: domain unit tests, server smoke test, Playwright browser flows
  and full PostgreSQL integration tests.
