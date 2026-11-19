# Production deployment

Use one always-running Node/Docker app instance, private PostgreSQL, and the existing private R2 bucket. Redis is not required: Telegram jobs use the durable PostgreSQL outbox. The production image uses Node 22; local development should use the version in `.nvmrc`.

## Configuration

Copy `.env.production.example` to the ignored `.env.production` and fill its values. Development can keep its LAN URL and testing calendar in `.env`. Production requires:

- The final public HTTPS origin in `NUXT_SITE_URL`. Update the website URL in Admin Settings too if an override was saved. Production rejects LAN/IP addresses and placeholder domains.
- `NUXT_PUBLIC_DEMO=false`, `NUXT_PUBLIC_TESTING_CALENDAR=false`, `NUXT_DEPLOYMENT_MODE=production`, and a random admin key with at least 32 characters.
- A private PostgreSQL connection; URL-encode the password inside `NUXT_DATABASE_URL`.
- R2 object read/write credentials, its bucket name, and account API origin. All existing local media has been copied and verified in R2 without changing IDs or URLs; originals remain on disk.
- The existing `TEBU_BACKUP_ENCRYPTION_KEY` from the ignored local `.env`, saved separately in a password manager and supplied to the host as a secret. Losing this key prevents restoration of its backups. New installations can generate a key with `openssl rand -base64 32`.
- Telegram bot credentials in the host's secret environment. The chat, message opening, and website URL remain editable in Admin Settings.

Set `NUXT_TRUST_PROXY=true` only when the app is accessible exclusively through a trusted reverse proxy. The proxy must overwrite client-supplied forwarding headers, preserve the public `Host`, set `X-Forwarded-Proto=https`, and supply the real `X-Forwarded-For`. The provided Compose file binds app port 3000 to loopback and never exposes PostgreSQL. Configure HTTPS and an edge upload limit of at least 300 KB.

Validate configuration:

```sh
node --env-file=.env.production --import tsx scripts/check-production.ts
```

The production entrypoint validates configuration before opening the HTTP listener. `/api/ready` also verifies database/schema access. A saved invalid website override prevents readiness.

## Build and release

Commit the tested source, dependency lockfile, and migrations before a Git deployment. Never commit `.env`, uploads, encryption keys, or backup archives.

```sh
docker compose --env-file .env.production -f compose.production.yml build
docker compose --env-file .env.production -f compose.production.yml stop app backup
docker compose --env-file .env.production -f compose.production.yml up -d --force-recreate release app backup
docker compose --env-file .env.production -f compose.production.yml ps
docker compose --env-file .env.production -f compose.production.yml logs release
```

The release job validates settings, creates and verifies an encrypted database/media backup in R2, runs `prisma migrate deploy`, and initializes schedules without sample orders or overwriting existing records. The app and scheduled backup service start only after release succeeds. A fresh database receives an empty pre-migration backup first. Never run development seed/reset commands against production.

For Coolify with an existing PostgreSQL resource, use [compose.coolify.yml](compose.coolify.yml) and follow [COOLIFY.md](COOLIFY.md). The standalone production Compose file above creates its own database; the Coolify variant reuses yours. Configure the domain/proxy to route to app port 3000. The runtime image runs as an unprivileged user; only the operations job needs the Prisma CLI and migration privileges. Keep one app replica until rate limiting uses shared storage.

## Existing data

If carrying over the existing store, restore a verified archive into the new, empty production database before release and use its existing R2 bucket. Orders, stock, settings, receipts, audit history and the order-number counter are included. The local database contains development/test records: review which records belong in the live store before opening orders. Deployment does not purge records automatically.

## Backups and restoration

The backup service runs immediately, then every 24 hours. Its AES-256-GCM encrypted archive contains a consistent PostgreSQL dump, media manifest, image bytes and SHA-256 checksums. Success is recorded only after reading back and verifying the encrypted R2 copy. The latest 14 local archives are retained in the backup volume. R2 copies remain until you configure a retention lifecycle limited to the `backups/` prefix; never apply that lifecycle to live images.

The backup container becomes unhealthy when no recent verified offsite archive exists. Configure host monitoring to alert on that condition and retain service logs. Keep the encryption key separately secured and repeat restore drills periodically.

Manual backup:

```sh
docker compose --env-file .env.production -f compose.production.yml run --rm backup node --import tsx scripts/backup.ts
```

Download an encrypted archive from R2 or use the backup volume. Create a **new, empty database** and set its URI in `TEBU_RESTORE_DATABASE_URL`; keep the original encryption key and R2 credentials available. Restore refuses a database with existing tables, verifies authentication/checksums, restores missing images without replacing different existing objects, and restores database contents in one transaction.

```sh
docker compose --env-file .env.production -f compose.production.yml run --rm -e TEBU_RESTORE_DATABASE_URL backup node --import tsx scripts/restore.ts /backups/your-backup.backup.enc
```

Verify the restored records and images before switching the app's database URI. The operational images include PostgreSQL client tools. When running scripts locally, install `pg_dump`, `pg_restore`, and `tar`; use a PostgreSQL client at least as new as the database server.

## Launch verification

`/api/health` checks liveness only. `/api/ready` returns 503 when the database or required schema is unavailable; Docker uses readiness for app health. Check app and backup health after each release.

`npm run test:flows` includes an isolated production configuration behind a local HTTPS proxy. It exercises secure cookies, production dates, checkout, R2 receipt privacy, approval, packing, delivery, collection, separate rate limits, release, backup, restore and tamper rejection. It sends no real payment or Telegram notification.

Before opening orders, test the real deployed HTTPS domain, scan the actual merchant QR, and complete a small payment through receipt review and collection. Verify the real Telegram review link on a phone. Keep ordering closed until that final production check is complete.
