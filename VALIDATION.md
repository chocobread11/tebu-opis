# Validation results

- Passed: `npm test` — 3 domain tests covering Malaysian phone normalization, integer-sen pricing, bottle tally and Malaysia-time schedule boundaries.
- Passed: `npm run typecheck` — Nuxt/Vue/server TypeScript.
- Passed: `npm run build` — full Nuxt 3 Node server and client bundle, without prerendering runtime production configuration into static pages.
- Passed: `npm run generate` — browser-local demo pages `/`, `/drop`, `/admin` and fallback pages.
- Passed: `node tests/server.mjs` — SSR content, production runtime demo toggle, health, admin authentication, invalid ticket tokens, missing database configuration, cross-origin writes, upload limits and cache headers. Uses Nuxt’s in-process request harness without an HTTP listener.
- Not run: browser interaction and visual QA. Chromium launch failed with macOS process permission restrictions. A complete Playwright workflow is included at `tests/browser.mjs` for a development machine that can launch Chromium.
- Not run: real PostgreSQL transaction integration. Local PostgreSQL initialization was blocked by shared-memory permissions. Capacity locking, migrations and status transitions require integration validation against your private Coolify database.
- Not deployed: source synchronization failed because the workspace could not resolve `git.chatgpt-team.site`. A private Site was registered, but no version was published. The built demo archive and source are available locally.

The add-on price of RM1 per pouch is an implementation assumption. Production requires the operator’s real DuitNow QR, merchant name, database URL, persistent upload volume and admin key. Never accept payments from the demo.
