export default defineEventHandler(async event => {
  requireAdmin(event)
  const [rows, schedules] = await Promise.all([
    db().order.findMany({ where: { OR:[{createdAt:{gte:new Date(Date.now()-45*86400000)}},{scheduleId:{gte:new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Kuala_Lumpur'})}}] }, orderBy: { createdAt: 'desc' }, take: 1000 }),
    db().schedule.findMany({ orderBy: { id: 'asc' } }),
  ])
  return { orders: await Promise.all(rows.map(o => toTicket(o, true))), schedules, varieties: await catalogStock(db()), products: await productCatalog(db(), true), ...await shopSettings() }
})
