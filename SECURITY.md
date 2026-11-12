# Security Policy

Tebu Drop handles real payments (DuitNow QR), customer phone numbers and internal
revenue data. Security issues are taken seriously and fixed quickly.

## Supported versions

Only the latest release on `main` is supported with security fixes.

## Reporting a vulnerability

Please **do not open a public issue** for security problems.

- Email: report via your GitHub contact or privately to the repository owner.
- Include a description, reproduction steps and affected endpoints/files.
- You will receive an acknowledgement within 72 hours and a fix timeline once triaged.

## Security model overview

| Layer | Mechanism |
| --- | --- |
| Validation | Every mutating endpoint parses its body with strict Zod schemas |
| Tokens | Customer access tokens are 256-bit random values, stored only as SHA-256 digests |
| History | Phone-only lookup when unprotected; optional salted scrypt password; fixed 30-minute HttpOnly/SameSite cookie sessions (Secure on HTTPS); lock history revokes the current session and protection changes revoke all sessions |
| Admin | Authorization requires `NUXT_ADMIN_KEY`; comparisons use `timingSafeEqual` and fail closed |
| Capability links | Pickup tickets (`/drop?t=…`) act as bearer capability URLs — do not share them |
| Rate limiting | 120 requests/minute per client IP with per-endpoint body-size limits |
| Uploads | JPG, PNG and WebP verified and re-encoded as WebP server-side with sharp, capped below 250 KB and stored under random names with metadata stripped |
| Headers | `nosniff`, `no-referrer`, `DENY` framing, restrictive `Permissions-Policy`, `Cache-Control: no-store` on all API responses |

Known trade-offs (documented in the README) include bearer capability ticket
links, trust of `X-Forwarded-For` behind your reverse proxy, and no built-in
phone-ownership verification. Review the *Security* section of the README before
deploying to production.

## Deployment hardening checklist

1. Generate `NUXT_ADMIN_KEY` with at least 32 random characters.
2. Serve HTTPS only; configure trusted-proxy headers in your edge.
3. Restrict PostgreSQL to a private network and back up the database with the
   uploads volume.
4. Add a CSP suited to your domain; the app intentionally leaves it to the operator.
5. Schedule cleanup of unattached receipts/uploads and expired reservations.
