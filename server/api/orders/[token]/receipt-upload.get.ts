export default defineEventHandler(async event => {
  const order = await findOrder(getRouterParam(event, 'token') || '')
  await authorizeReceipt(event, order)
  return { tag: order.tag, total: order.total, scheduleId: order.scheduleId, status: order.status, expiresAt: order.expiresAt.toISOString() }
})
