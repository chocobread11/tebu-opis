import { z } from 'zod'
const input = z.object({ password: z.string().min(8).max(128).nullable(), currentPassword: z.string().max(128).optional() })
export default defineEventHandler(async event => {
  const customer = await requireCustomer(event)
  const parsed = input.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, message: 'Use a password with at least 8 characters.' })
  limitPasswordAttempts(event, customer.phone || customer.id)
  if (customer.passwordHash && (!parsed.data.currentPassword || !await verifyPassword(parsed.data.currentPassword, customer.passwordHash))) throw createError({ statusCode: 403, message: 'Enter your current password to change protection.' })
  return db().$transaction(async tx => {
    await tx.customer.update({ where: { id: customer.id }, data: { passwordHash: parsed.data.password ? await hashPassword(parsed.data.password) : null, tokenHash: hashToken(newToken()) } })
    await tx.customerSession.deleteMany({ where: { customerId: customer.id } })
    const token = newToken()
    await tx.customerSession.create({ data: { customerId: customer.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 24 * 60 * 60_000) } })
    return { token, protected: !!parsed.data.password }
  })
})
