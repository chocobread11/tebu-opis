export default defineEventHandler(async event => {
  const token = customerAccessToken(event)
  if (/^[\w-]{43}$/.test(token)) await db().customerSession.deleteMany({ where: { tokenHash: hashToken(token) } })
  clearCustomerSession(event)
  return { ok: true }
})
