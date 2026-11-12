import { z } from 'zod'
import { customerSessionLifetime } from '../../../shared/session'
const input = z.object({ password: z.string().min(8).max(128).nullable(), currentPassword: z.string().max(128).optional(), cookieSession: z.boolean().default(false) })
export default defineEventHandler(async event => {
  const customer = await requireCustomer(event)
  const parsed = input.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, message: 'Use a password with at least 8 characters.' })
  limitPasswordAttempts(event, customer.phone || customer.id)
  if (customer.passwordHash && (!parsed.data.currentPassword || !await verifyPassword(parsed.data.currentPassword, customer.passwordHash))) throw createError({ statusCode: 403, message: 'Enter your current password to change protection.' })
  const cookieSession = parsed.data.cookieSession || !!getCookie(event, customerSessionCookie)
  const result = await db().$transaction(async tx => {
    await tx.customer.update({ where: { id: customer.id }, data: { passwordHash: parsed.data.password ? await hashPassword(parsed.data.password) : null, tokenHash: hashToken(newToken()) } })
    await tx.customerSession.deleteMany({ where: { customerId: customer.id } })
    const token = newToken()
    const expiresAt = new Date(Date.now() + customerSessionLifetime)
    await tx.customerSession.create({ data: { customerId: customer.id, tokenHash: hashToken(token), expiresAt } })
    return { token, protected: !!parsed.data.password, expiresAt }
  })
  rememberCustomerSession(event, result.token, result.expiresAt)
  return { ...(!cookieSession ? { token: result.token } : {}), protected: result.protected, expiresAt: result.expiresAt.toISOString() }
})
