import { z } from 'zod'
import { adminSessionCookie, clearAdminSession } from '../../../utils/admin-session'
export default defineEventHandler(async event => {
  if (!z.object({}).strict().safeParse(await readBody(event)).success) throw createError({ statusCode: 400, message: 'Invalid sign-out request.' })
  const token = getCookie(event, adminSessionCookie)
  if (token && /^[\w-]{43}$/.test(token)) await db().adminSession.deleteMany({ where: { tokenHash: hashToken(token) } })
  clearAdminSession(event)
  return { ok: true }
})
