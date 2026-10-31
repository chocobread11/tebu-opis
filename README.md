# tebu-opis / Tebu Drop

Mobile-first office sugarcane ordering with Nuxt 3, Vue, Tailwind, accessible Vaul/Reka drawers, Drizzle and PostgreSQL. The hosted Sites build is an explicitly labeled browser-local demo; the same source builds a Node server for Coolify.

## Run

```sh
npm install
npm run dev
```

Default demo mode needs no services. Add bottles, select a drop, complete demo checkout using a sample receipt, open Pantry ops, confirm payment, pack the bag, upload a freezer photo, mark ready, preview a WhatsApp message and collect from My bottle. Demo records stay in localStorage on this browser. Demo WhatsApp previews never contact real numbers.

## Production on Coolify

1. Create a PostgreSQL service on the private Coolify network. Keep port 5432 private. Back up the database and the uploads volume together.
2. Put the **real merchant DuitNow QR** at `public/duitnow-qr.png` before building. Set your actual merchant name. Verify it scans to the correct account and do a small end-to-end payment before opening orders.
3. Configure the variables in `.env.example`, particularly `NUXT_PUBLIC_DEMO=false`, `NUXT_DATABASE_URL`, and a random `NUXT_ADMIN_KEY` of at least 32 characters. All private values remain server-side. Do not commit `.env`.
4. From a trusted runner with private DB access, run `npm run db:migrate` then `npm run db:seed`. Run the seed weekly to add the next Mon–Thu dates; it preserves existing schedules. Set capacity with a trusted SQL migration or DB admin, not a public endpoint.
5. Deploy the Dockerfile on port 3000. Mount a persistent volume at `/app/data/uploads`, writable by UID 1000. Configure HTTPS and request body limits (300 KB), and trusted proxy/rate limits in Coolify. One Node replica is supported by the in-process rate limiter; use a shared limiter before scaling.
6. Check `/api/health`, open `/admin` using the admin key, verify private receipt access and test ordering against the real database. Health is process liveness, not database readiness.

`npm run build` creates the complete Node app. `npm run generate` creates the private Sites **demo**, deliberately without APIs. Do not use static output to accept real orders. The Docker build uses `npm install` because this restricted workspace may not be able to resolve every package into a portable lockfile; generate and commit a lockfile in your connected CI, then use `npm ci`.

## Payment and identity

- All totals are computed on the server in integer sen. Flask RM6; jug RM11; add-on pouches RM1 each (configurable in `shared/domain.ts`).
- Reservations expire after 20 minutes. Schedule row locks enforce bottle capacity and sequential per-drop tags under concurrent checkout. Receipt submission changes only an unexpired reservation to `pending_review`. A human checks the bank payment before approving.
- Normalized phone numbers identify records. Random 256-bit customer tokens authorize access and are stored hashed in PostgreSQL. A phone number alone cannot retrieve someone's name or orders. A returning device reuses its token; changing devices requires operator-assisted recovery. The initial phone claim is **not proof of phone ownership**; add a phone verification channel if your deployment needs that assurance.
- Private ticket links are capability tokens: anyone with the link can view that ticket and confirm collection when ready. Do not share them. Responses disable caching; referrers are suppressed. Receipts require the admin key, and freezer images publish only after the operator marks the drop.
- Customer tokens are stored in localStorage as specified. The operator key stays in memory. For internet production, configure CSP and proxy hardening to suit your final assets and domain. Never paste customer or admin tokens into analytics.
- Lost-token recovery is intentionally an operator procedure, not a phone-only public reset. Verify the customer separately, generate 32 random bytes, replace `customers.token_hash` with the new token's SHA-256 digest through a trusted console, and deliver the raw token privately. A self-service recovery UI, automated refunds, automated payment verification, retention cleanup and scheduled jobs are not included.
- The client encodes receipts to WebP under 80,000 bytes; the server checks size and decodes/re-encodes with Sharp, stripping metadata. Files use random names outside the public directory. Operators should remove old unattached uploads with a scheduled maintenance job after choosing a retention policy.
- WhatsApp opens the recipient's drafted message. The operator must send it in WhatsApp and then confirm “I've sent it” before moving to the next person. The app never sends messages automatically.

## Validation

```sh
npm test
npm run typecheck
npm run build
npm run generate
node tests/server.mjs
```

Domain tests cover mobile normalization, integer pricing, bottle counts and Malaysia-time drop schedules. The server smoke test checks SSR and security guards through Nuxt’s in-process prerender harness. The browser smoke test (`node tests/browser.mjs`, against a running local demo app) covers cart, checkout, receipt, ticket, operator confirmation, packing, freezer drop, dispatch preview and collection, plus narrow-screen overflow. Browser execution and live PostgreSQL integration were blocked by this workspace’s process permissions; those checks remain required on a connected development machine before taking real orders.

Framework references: [Nuxt deployment](https://nuxt.com/docs/3.x/getting-started/deployment), [Drizzle constraints](https://orm.drizzle.team/docs/indexes-constraints).
