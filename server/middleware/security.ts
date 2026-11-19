import { authenticateAdminCookie } from '../utils/admin-session'
import { getRequestIP } from 'h3'
import { RequestLimiter, rateLimitBucket, sessionFingerprint } from '../security/rate-limit'
const limiter = new RequestLimiter()
export default defineEventHandler(async event => {
  setHeaders(event, { 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY', 'Permissions-Policy': 'camera=(), microphone=(), geolocation=()' })
  if (!event.path.startsWith('/api/')) return
  setHeader(event, 'Cache-Control', 'no-store')
  const config = useRuntimeConfig()
  const ip = getRequestIP(event, { xForwardedFor: String(config.trustProxy) === 'true' }) || 'local'
  event.context.clientIp = ip
  const path = event.path.split('?')[0]!
  if (path !== '/api/health' && path !== '/api/ready') {
    const bucket = rateLimitBucket(event.method, path)
    const session = getCookie(event, 'tebu_admin_session') || getCookie(event, 'tebu_checkout_session') || getCookie(event, 'tebu_customer_session') || bearer(event)
    const retries = [limiter.consume(`${bucket.name}:ip:${ip}`, bucket.ip)]
    if (session) retries.push(limiter.consume(`${bucket.name}:session:${sessionFingerprint(session)}`, bucket.session))
    const retry = Math.max(...retries)
    if (retry) { setHeader(event, 'Retry-After', retry); throw createError({ statusCode: 429, message: 'Too many requests. Wait a moment and try again.' }) }
  }
  await authenticateAdminCookie(event)
  if (!['POST', 'PATCH', 'PUT'].includes(event.method)) return
  const origin = getHeader(event, 'origin')
  if (origin && origin !== getRequestURL(event).origin) throw createError({ statusCode: 403, message: 'Cross-origin requests are not allowed.' })
  const length = Number(getHeader(event, 'content-length'))
  if (!Number.isSafeInteger(length) || length <= 0) throw createError({ statusCode: 411, message: 'Content length is required.' })
  const max = (event.path === '/api/uploads' || /^\/api\/admin\/products\/[\w-]+\/image$/.test(event.path)) ? 300000 : event.path === '/api/admin/logs/import' ? 1_000_000 : 16000
  if (length > max) throw createError({ statusCode: 413, message: 'Upload is too large.' })
})
