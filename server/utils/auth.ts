import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import type { H3Event } from 'h3'
export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex')
export const newToken = () => randomBytes(32).toString('base64url')
export function bearer(event: H3Event) { return getHeader(event, 'authorization')?.match(/^Bearer (\S+)$/)?.[1] || '' }
export function isAdmin(event: H3Event) {
  const key = useRuntimeConfig().adminKey
  if (!key || key.length < 32) return false
  return timingSafeEqual(Buffer.from(hashToken(key)), Buffer.from(hashToken(bearer(event))))
}
export function requireAdmin(event: H3Event) { if (!isAdmin(event)) throw createError({ statusCode: 401, message: 'A valid admin key is required.' }) }
export async function requireCustomer(event: H3Event) {
  const token = bearer(event)
  if (!token || token.length > 100) throw createError({ statusCode: 401, message: 'Your customer token is required.' })
  const customer = await db().customer.findUnique({ where: { tokenHash: hashToken(token) } })
  if (!customer) throw createError({ statusCode: 401, message: 'This customer token is no longer valid.' })
  return customer
}
export async function findOrder(token: string) {
  if (!/^[\w-]{43}$/.test(token)) throw createError({ statusCode: 404, message: 'Ticket not found.' })
  const order = await db().order.findUnique({ where: { token } })
  if (!order) throw createError({ statusCode: 404, message: 'Ticket not found.' })
  return order
}
