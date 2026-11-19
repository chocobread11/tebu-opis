import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import type { H3Event } from 'h3'
import { customerSessionLifetime } from '../../shared/session'
const derive = promisify(scrypt)
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex')
  const key = await derive(password, salt, 64) as Buffer
  return `scrypt:${salt}:${key.toString('hex')}`
}
export async function verifyPassword(password: string, encoded: string) {
  const [algorithm, salt, hex] = encoded.split(':')
  if (algorithm !== 'scrypt' || !salt || !hex || !/^[0-9a-f]{128}$/i.test(hex)) return false
  const key = await derive(password, salt, 64) as Buffer
  return timingSafeEqual(key, Buffer.from(hex, 'hex'))
}
const attempts = new Map<string, { count: number; expires: number }>()
export function limitPasswordAttempts(event: H3Event, phone: string) {
  const now = Date.now()
  for (const [key, row] of attempts) if (row.expires <= now) attempts.delete(key)
  const key = `${event.context.clientIp || getRequestIP(event)}:${phone}`
  const row = attempts.get(key)
  if (row && row.count >= 10) {
    setHeader(event, 'Retry-After', Math.ceil((row.expires - now) / 1000))
    throw createError({ statusCode: 429, message: 'Too many attempts. Try again in five minutes.' })
  }
  if (row) row.count++
  else attempts.set(key, { count: 1, expires: now + 5 * 60_000 })
}
export async function issueCustomerSession(customerId: string) {
  const token = newToken()
  const expiresAt = new Date(Date.now() + customerSessionLifetime)
  await db().customerSession.deleteMany({ where: { customerId, expiresAt: { lt: new Date() } } })
  await db().customerSession.create({ data: { customerId, tokenHash: hashToken(token), expiresAt } })
  return { token, expiresAt }
}
