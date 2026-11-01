import { z } from 'zod'
import { normalizePhone } from '../../shared/domain'
const input = z.object({ phone: z.string().max(20), name: z.string().trim().min(2).max(60) })
export default defineEventHandler(async event => {
  const parsed = input.safeParse(await readBody(event)); if (!parsed.success) throw createError({ statusCode: 400, message: 'Enter your mobile number and name.' })
  let phone: string
  try { phone = normalizePhone(parsed.data.phone) } catch { throw createError({ statusCode: 400, message: 'Enter a valid Malaysian mobile number.' }) }
  const existing = await db().customer.findUnique({ where: { phone } })
  if (existing) {
    if (existing.tokenHash !== hashToken(bearer(event))) throw createError({ statusCode: 403, message: 'Use your original device or ask the pantry operator to restore access. We never reveal a name from a phone number alone.' })
    return { token: bearer(event), name: existing.name }
  }
  const token = newToken()
  const inserted = await db().customer.createMany({ data: { phone, name: parsed.data.name, tokenHash: hashToken(token) }, skipDuplicates: true })
  if (!inserted.count) throw createError({ statusCode: 409, message: 'Please retry from your original device.' })
  return { token, name: parsed.data.name }
})
