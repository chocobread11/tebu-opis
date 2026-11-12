import type { H3Event } from 'h3'
import { customerSessionLifetime } from '../../shared/session'

export const customerSessionCookie = 'tebu_customer_session'
export function customerAccessToken(event: H3Event) { return bearer(event) || getCookie(event, customerSessionCookie) || '' }
function cookieOptions(event: H3Event) {
  return { httpOnly: true, secure: getRequestURL(event, { xForwardedProto: true }).protocol === 'https:', sameSite: 'lax' as const, path: '/' }
}
export function rememberCustomerSession(event: H3Event, token: string, expiresAt: Date) {
  if (getCookie(event, customerSessionCookie) === token) return
  const maxAge = Math.max(0, Math.min(customerSessionLifetime / 1000, Math.ceil((expiresAt.getTime() - Date.now()) / 1000)))
  setCookie(event, customerSessionCookie, token, { ...cookieOptions(event), maxAge, expires: expiresAt })
}
export function clearCustomerSession(event: H3Event) { deleteCookie(event, customerSessionCookie, cookieOptions(event)) }
export async function findCustomerSession(event: H3Event) {
  const token = customerAccessToken(event)
  if (!/^[\w-]{43}$/.test(token)) return null
  const session = await db().customerSession.findUnique({ where: { tokenHash: hashToken(token) }, include: { customer: true } })
  if (!session || session.expiresAt <= new Date()) {
    if (getCookie(event, customerSessionCookie) === token) clearCustomerSession(event)
    return null
  }
  return { ...session, token }
}
