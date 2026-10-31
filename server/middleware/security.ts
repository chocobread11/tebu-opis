import { getRequestIP } from 'h3'
const windows = new Map<string, { count: number; expires: number }>()
let lastSweep = 0
export default defineEventHandler(event => {
  setHeaders(event, { 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY', 'Permissions-Policy': 'camera=(), microphone=(), geolocation=()' })
  if (!event.path.startsWith('/api/')) return
  setHeader(event, 'Cache-Control', 'no-store')
  const now = Date.now()
  if (now - lastSweep > 60000) { for (const [key, value] of windows) if (value.expires < now) windows.delete(key); lastSweep = now }
  const key = getRequestIP(event) || 'local'
  const window = windows.get(key)
  if (window && window.expires > now) { if (++window.count > 120) { setHeader(event, 'Retry-After', 60); throw createError({ statusCode: 429, message: 'Too many requests. Wait a minute and try again.' }) } }
  else windows.set(key, { count: 1, expires: now + 60000 })
  if (!['POST', 'PATCH', 'PUT'].includes(event.method)) return
  const origin = getHeader(event, 'origin')
  if (origin && origin !== getRequestURL(event).origin) throw createError({ statusCode: 403, message: 'Cross-origin requests are not allowed.' })
  const length = Number(getHeader(event, 'content-length'))
  if (!Number.isSafeInteger(length) || length <= 0) throw createError({ statusCode: 411, message: 'Content length is required.' })
  const max = event.path === '/api/uploads' ? 300000 : 16000
  if (length > max) throw createError({ statusCode: 413, message: 'Upload is too large.' })
})
