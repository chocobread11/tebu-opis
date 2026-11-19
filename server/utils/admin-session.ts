import type { H3Event } from 'h3'
export const adminSessionCookie = 'tebu_admin_session'
export const adminSessionLifetime = 12 * 60 * 60_000
function options(event: H3Event) { return { httpOnly: true, secure: getRequestURL(event, { xForwardedProto: true }).protocol === 'https:', sameSite: 'lax' as const, path: '/' } }
export function clearAdminSession(event: H3Event) { deleteCookie(event, adminSessionCookie, options(event)) }
export function rememberAdminSession(event: H3Event, token: string, expiresAt: Date) {
  setCookie(event, adminSessionCookie, token, { ...options(event), expires: expiresAt, maxAge: Math.max(0, Math.ceil((expiresAt.getTime() - Date.now()) / 1000)) })
}
export async function authenticateAdminCookie(event: H3Event) {
  if (!event.path.startsWith('/api/admin') && event.path !== '/api/uploads' && !event.path.startsWith('/api/media/')) return
  const token = getCookie(event, adminSessionCookie)
  if (!token || !/^[\w-]{43}$/.test(token) || isAdminKey(event)) return
  const config = useRuntimeConfig(), key = String(config.adminKey || '')
  if (!config.databaseUrl || String(config.public.demo) === 'true' || !key || (!import.meta.dev && key.length < 32)) return
  const session = await db().adminSession.findUnique({ where: { tokenHash: hashToken(token) } })
  if (!session || session.expiresAt <= new Date() || session.keyHash !== hashToken(key)) { clearAdminSession(event); return }
  event.context.adminSession = { tokenHash: session.tokenHash, expiresAt: session.expiresAt }
}
