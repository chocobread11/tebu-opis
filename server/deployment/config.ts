import { isIP } from 'node:net'

export function publicHttpsOrigin(value: unknown) {
  try {
    const url = new URL(String(value))
    return url.protocol === 'https:' && !url.username && !url.password && url.pathname === '/' && !url.search && !url.hash && url.hostname.includes('.') && !/(^|\.)(localhost|local|internal|test|example|invalid)$/.test(url.hostname) && !isIP(url.hostname.replace(/^\[|\]$/g, ''))
  } catch { return false }
}

export function productionConfigIssues(config: {
  deploymentMode: unknown; databaseUrl: unknown; siteUrl: unknown; adminKey: unknown; uploadStorage: unknown
  public: { demo: unknown; testingCalendar: unknown }
  r2: { accountId: unknown; endpoint: unknown; accessKeyId: unknown; secretAccessKey: unknown; bucket: unknown }
}) {
  if (config.deploymentMode !== 'production') return []
  const issues: string[] = []
  if (String(config.public.demo) !== 'false') issues.push('NUXT_PUBLIC_DEMO must be false.')
  if (String(config.public.testingCalendar) !== 'false') issues.push('NUXT_PUBLIC_TESTING_CALENDAR must be false.')
  if (!config.databaseUrl) issues.push('Set NUXT_DATABASE_URL.')
  if (String(config.adminKey || '').length < 32 || /replace|example|change.?me/i.test(String(config.adminKey))) issues.push('Set a random NUXT_ADMIN_KEY with at least 32 characters.')
  if (!publicHttpsOrigin(config.siteUrl)) issues.push('Set NUXT_SITE_URL to the final public HTTPS origin, without a path.')
  if (config.uploadStorage !== 'r2') issues.push('NUXT_UPLOAD_STORAGE must be r2.')
  const r2 = config.r2
  if ((!r2.accountId && !r2.endpoint) || !r2.bucket || !r2.accessKeyId || !r2.secretAccessKey) issues.push('Configure the R2 endpoint/account ID, bucket and access keys.')
  return issues
}
