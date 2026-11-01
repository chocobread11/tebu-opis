# Contributing to Tebu Drop

Thank you for considering a contribution. This repository is an intentionally
small, opinionated codebase; changes should keep it that way.

## Ground rules

- Keep TypeScript strict and avoid adding framework dependencies without
  a strong reason.
- All mutating server endpoints must validate input with Zod and map responses
  to domain shapes in `shared/domain.ts` (no raw Prisma rows on public routes).
- Money is computed on the server in integer sen — never floats.
- Follow the existing code style (no comments unless explaining a
  non-obvious invariant).

## Development setup

```sh
npm install
cp .env.example .env       # then fill in your Postgres URL and admin key
npm run db:migrate:dev
npm run db:seed
npm run dev
```

Demo-only mode (no database required):

```sh
NUXT_PUBLIC_DEMO=true npm run dev
```

## Before opening a pull request

```sh
npm run typecheck
npm test
npm run build
node tests/server.mjs     # requires `npm run generate` first
```

If your change touches checkout, capacity or scheduling, also run the database
integration suite against a Postgres you control:

```sh
npm run test:database
```

## Pull request guidelines

1. One logical change per PR; rebase on `main` before opening.
2. Describe the behaviour change and how to verify it.
3. Include tests for new server routes or domain logic.
4. Never commit `.env`, seed tokens or customer data — CI treats this as a hard error.
