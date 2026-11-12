import { z } from 'zod'
import { normalizePhone } from '../../../shared/domain'

// Profile discovery does not sign in, create customers, or renew a session.
export default defineEventHandler(async event => {
  const input = z.object({ phone: z.string().max(20) }).strict().safeParse(await readBody(event))
  if (!input.success) throw createError({ statusCode: 400, message: 'Enter a valid Malaysian mobile number.' })
  let phone: string
  try { phone = normalizePhone(input.data.phone) } catch { throw createError({ statusCode: 400, message: 'Enter a valid Malaysian mobile number.' }) }
  const customer = await db().customer.findUnique({ where: { phone } })
  if (!customer) return { found: false, passwordRequired: false }
  const protectedProfile = !!customer.passwordHash
  const session = protectedProfile ? await findCustomerSession(event) : null
  if (protectedProfile && session?.customerId !== customer.id) return { found: true, passwordRequired: true, protected: true }
  return { found: true, passwordRequired: false, protected: protectedProfile, name: customer.name, phone }
})
