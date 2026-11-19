import type { H3Event } from 'h3'
import { customerSessionLifetime } from '../../shared/session'

export const checkoutSessionCookie = 'tebu_checkout_session'
export async function findCheckoutSession(event: H3Event) {
  const token = getCookie(event, checkoutSessionCookie) || ''
  if (!/^[\w-]{43}$/.test(token)) return null
  const session = await db().checkoutSession.findUnique({ where: { tokenHash: hashToken(token) }, include: { customer: true } })
  return session && session.expiresAt > new Date() ? session : null
}
export async function issueCheckoutSession(event: H3Event, customerId: string) {
  const existing = await findCheckoutSession(event)
  const token = existing?.customerId === customerId ? getCookie(event, checkoutSessionCookie)! : newToken()
  const expiresAt = new Date(Date.now() + customerSessionLifetime)
  await db().checkoutSession.deleteMany({ where: { customerId, expiresAt: { lt: new Date() } } })
  const session = await db().checkoutSession.upsert({ where: { tokenHash: hashToken(token) }, create: { tokenHash: hashToken(token), customerId, expiresAt }, update: { expiresAt } })
  setCookie(event, checkoutSessionCookie, token, { httpOnly: true, secure: getRequestURL(event, { xForwardedProto: true }).protocol === 'https:', sameSite: 'lax', path: '/', maxAge: customerSessionLifetime / 1000, expires: expiresAt })
  return session
}
export async function requireCheckoutAccess(event: H3Event) {
  // Explicit bearer clients keep using the existing customer authentication API.
  const checkout = !bearer(event) ? await findCheckoutSession(event) : null
  if (checkout) return { customer: checkout.customer, checkoutSessionHash: checkout.tokenHash }
  return { customer: await requireCustomer(event), checkoutSessionHash: null }
}
