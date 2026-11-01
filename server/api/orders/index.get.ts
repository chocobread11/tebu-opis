export default defineEventHandler(async event => {
  const customer = await requireCustomer(event)
  const rows = await db().order.findMany({ where: { customerId: customer.id }, orderBy: { createdAt: 'desc' }, take: 200 })
  return { orders: await Promise.all(rows.map(order => toTicket(order))) }
})
