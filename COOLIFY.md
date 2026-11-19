# Coolify: existing PostgreSQL and shop.example.invalid

Use `compose.coolify.yml`. It runs the app, a one-time release job, and the scheduled backup worker. It connects to your existing PostgreSQL resource; it does not create a database container and does not require a committed `.env.production` file.

## 1. Publish the tested Git revision

Push the local commits to the repository/branch Coolify uses. A local commit is not visible to the deployment server until pushed. Include `compose.coolify.yml`, the Dockerfile and migrations. Keep `.env*` secrets out of Git.

## 2. Connect the existing database

Open your PostgreSQL resource in Coolify and copy its **internal** connection URL into `NUXT_DATABASE_URL` under the new application's environment variables. Use the same server and destination as the database. Do not use `localhost`, the laptop's database URL, or the database's public URL.

Enable **Advanced → Docker compose → Predefined network → Connect to predefined network** so `app`, `release` and `backup` can reach that PostgreSQL resource. Sharing a project name alone does not connect their networks. Keep the database's public port disabled.

Use a separate empty database if this PostgreSQL resource also holds another application's data. If you want the current laptop store's products, stock, settings and historical orders online, restore its verified backup into an empty database before the first release. Pointing to an empty database initializes the default products and schedules; it does not transfer laptop records automatically.

## 3. Create the Git application

- Add the Git repository and select the branch containing the latest commits.
- Choose **Docker Compose** as the build strategy.
- Set Base Directory to `/` and Docker Compose Location to `/compose.coolify.yml`.
- Load/reload the Compose definition. Use normal deployment mode so Coolify generates proxy configuration; do not enable Raw Compose.
- Set only the `app` service's domain to `https://shop.example.invalid:3000`. Here `:3000` tells Coolify the internal container port. Customers use `https://shop.example.invalid` over normal HTTPS.
- Give `release` and `backup` no public domain. The one-time release service is excluded from aggregate health monitoring and exits after success; app and backup still require it to succeed.

## 4. Environment variables

The ignored local `.env.coolify` is prepared from your existing credentials and the production domain. Fill its blank `NUXT_DATABASE_URL` with the existing database's internal URI, then paste its contents into Coolify's environment-variable editor. Keep those values at runtime; they are not needed as build arguments. Never paste its contents into a chat or commit it.

Required private values are `NUXT_DATABASE_URL`, `NUXT_ADMIN_KEY`, the R2 access/secret keys and bucket, and `TEBU_BACKUP_ENCRYPTION_KEY`. Set either the R2 account ID or its account API endpoint. Reuse the existing backup encryption key and save it separately in a password manager.

For the existing Telegram alerts, retain `NUXT_TELEGRAM_BOT_TOKEN` and `NUXT_TELEGRAM_CHAT_ID`. Merchant/support values can be copied too. Production defaults in the Compose definition disable demo/testing calendars and enable R2. Keep:

```env
NUXT_SITE_URL=https://shop.example.invalid
```

Do not include `:3000` in `NUXT_SITE_URL`. Any saved website override in Admin Settings must also use the public HTTPS origin. The local development `.env` continues using LAN settings.

## 5. DNS and deploy

Point the `shop.example.invalid` DNS record at the Coolify server. Open the server's HTTP/HTTPS ports for the proxy and certificate validation; do not open the app or PostgreSQL ports separately. Coolify can issue the HTTPS certificate once DNS and routing are correct.

Click Deploy and inspect the `release` logs for verified backup, applied migrations and initialized schedules. The release job must exit successfully before the app and backup worker start. No manual `prisma migrate` command is needed. The release image has the migration tools; the smaller app image does not.

Check that `app` becomes healthy using `/api/ready`, the HTTPS domain loads, and the backup worker has a verified offsite archive. Then verify the merchant QR, one real small payment, its Telegram review link, receipt approval, packing and collection before opening orders.

## Terminal use

Normal setup and future deployments use Coolify's dashboard. A terminal is only needed for Git push if you use the CLI, optional data restoration/manual backups, or troubleshooting. Automated release jobs and the backup worker perform the recurring database work.

References: [Coolify Compose setup](https://coolify.io/docs/applications/builds/docker-compose), [private networking](https://coolify.io/docs/core/networking-in-coolify), [PostgreSQL connection URLs](https://coolify.io/docs/databases/postgresql).
