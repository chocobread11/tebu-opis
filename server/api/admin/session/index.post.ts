import { z } from 'zod'
import { adminSessionCookie, adminSessionLifetime, rememberAdminSession } from '../../../utils/admin-session'
export default defineEventHandler(async event => {
  if (!isAdminKey(event)) throw createError({ statusCode: 401, message: 'Enter a valid admin key.' })
  if (!z.object({}).strict().safeParse(await readBody(event)).success) throw createError({ statusCode: 400, message: 'Invalid sign-in request.' })
  const token = newToken(), expiresAt = new Date(Date.now() + adminSessionLifetime)
  const previous = getCookie(event, adminSessionCookie)
  await db().$transaction(async tx => {
    await tx.adminSession.deleteMany({ where: { OR: [{ expiresAt: { lte: new Date() } }, ...(previous ? [{ tokenHash: hashToken(previous) }] : [])] } })
    await tx.adminSession.create({ data: { tokenHash: hashToken(token), keyHash: hashToken(String(useRuntimeConfig().adminKey)), expiresAt } })
  })
  rememberAdminSession(event, token, expiresAt)
  return { expiresAt: expiresAt.toISOString() }
})
