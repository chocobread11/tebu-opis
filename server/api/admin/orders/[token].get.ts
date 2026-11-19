export default defineEventHandler(async event => {
  requireAdmin(event)
  return toTicket(await findOrder(getRouterParam(event, 'token') || ''), true)
})
