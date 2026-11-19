import { z } from 'zod'
import { normalizePhone } from '../../shared/domain'

const input = z.object({ phone: z.string().max(20), name: z.string().trim().min(2).max(60) }).strict()
export default defineEventHandler(async event => {
  const parsed = input.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, message: 'Enter your phone number and name (2–60 characters).' })
  let phone: string
  try { phone = normalizePhone(parsed.data.phone) } catch { throw createError({ statusCode: 400, message: 'Enter a valid Malaysian mobile number.' }) }
  // A new order never changes an existing profile or its password.
  const customer = await db().customer.upsert({ where: { phone }, update: {}, create: { phone, name: parsed.data.name, tokenHash: hashToken(newToken()) } })
  const checkout = await issueCheckoutSession(event, customer.id)
  const previous = await findCustomerSession(event)
  const historyUnlocked = previous?.customerId === customer.id || !customer.passwordHash
  if (customer.passwordHash && previous && previous.customerId !== customer.id) {
    await db().customerSession.deleteMany({ where: { tokenHash: previous.tokenHash } })
    clearCustomerSession(event)
  }
  if (!customer.passwordHash && previous?.customerId !== customer.id) {
    const history = await issueCustomerSession(customer.id)
    rememberCustomerSession(event, history.token, history.expiresAt)
  }
  return { name: parsed.data.name, phone, protected: !!customer.passwordHash, historyUnlocked, expiresAt: checkout.expiresAt.toISOString() }
})
