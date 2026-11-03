import { z } from 'zod'
import { normalizePhone } from '../../shared/domain'
const input = z.object({
  phone: z.string().max(20), name: z.string().trim().min(2).max(60).optional(),
  password: z.string().max(128).optional(), protectHistory: z.boolean().default(false),
  mode: z.enum(['checkout', 'history']).default('checkout'),
})
export default defineEventHandler(async event => {
  const parsed = input.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, message: 'Enter a valid phone number and name.' })
  const data = parsed.data
  let phone: string
  try { phone = normalizePhone(data.phone) } catch { throw createError({ statusCode: 400, message: 'Enter a valid Malaysian mobile number.' }) }
  limitPasswordAttempts(event, phone)
  let customer = await db().customer.findUnique({ where: { phone } })
  if (!customer) {
    if (data.mode === 'history') return { found: false, passwordRequired: false }
    if (!data.name) throw createError({ statusCode: 400, message: 'Enter your name.' })
    if (data.protectHistory && (!data.password || data.password.length < 8)) throw createError({ statusCode: 400, message: 'Use a password with at least 8 characters.' })
    const result = await db().customer.createMany({ data: { phone, name: data.name, tokenHash: hashToken(newToken()), passwordHash: data.protectHistory ? await hashPassword(data.password!) : null }, skipDuplicates: true })
    if (!result.count) throw createError({ statusCode: 409, message: 'This number was just registered. Please try again.' })
    customer = await db().customer.findUniqueOrThrow({ where: { phone } })
  } else if (customer.passwordHash) {
    // Checkout may reuse a previously authenticated session. History lookup always asks for the password.
    let trusted = false
    if (data.mode === 'checkout' && bearer(event)) {
      try { trusted = (await requireCustomer(event)).id === customer.id } catch { /* Ask for the password below. */ }
    }
    if (!trusted) {
      if (!data.password) return { found: true, passwordRequired: true }
      if (!await verifyPassword(data.password, customer.passwordHash)) throw createError({ statusCode: 403, message: 'Incorrect history password.' })
    }
  } else if (data.mode === 'checkout' && data.protectHistory) {
    if (!data.password || data.password.length < 8) throw createError({ statusCode: 400, message: 'Use a password with at least 8 characters.' })
    customer = await db().customer.update({ where: { id: customer.id }, data: { passwordHash: await hashPassword(data.password), tokenHash: hashToken(newToken()) } })
    await db().customerSession.deleteMany({ where: { customerId: customer.id } })
  }
  return { found: true, passwordRequired: false, protected: !!customer.passwordHash, token: await issueCustomerSession(customer.id), name: customer.name, phone }
})
