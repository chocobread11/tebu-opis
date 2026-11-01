import { malaysiaToday, describeDrop, activeOrderingWeek, publicDeliveryDays } from '../../shared/domain'
export default defineEventHandler(async () => {
  const week = activeOrderingWeek()
  const today = malaysiaToday()
  const rows = await db().schedule.findMany({ where: { id: { gte: week.start, lte: week.end } }, orderBy: { id: 'asc' } })
  const usage = await db().order.groupBy({ by: ['scheduleId'], where: { scheduleId: { in: rows.map(row => row.id) }, status: { not: 'rejected' }, OR: [{ status: { not: 'pending_payment' } }, { expiresAt: { gt: new Date() } }] }, _sum: { bottles: true } })
  const sizeUsage = await Promise.all(rows.map(async row => ({ id: row.id, ...await dailyBottleUsage(db(), row.id) })))
  const days = publicDeliveryDays(week.days.map(id => {
    const row = rows.find(schedule => schedule.id === id)
    return { id, open: !!row?.open && !row.removedAt && !row.droppedAt && id > today, flaskCapacity: row?.flaskCapacity ?? 0, jugCapacity: row?.jugCapacity ?? 0, flaskRemaining: Math.max(0, (row?.flaskCapacity ?? 0) - (sizeUsage.find(u => u.id === id)?.flask ?? 0)), jugRemaining: Math.max(0, (row?.jugCapacity ?? 0) - (sizeUsage.find(u => u.id === id)?.jug ?? 0)), capacity: row?.capacity ?? 0, remaining: Math.max(0, (row?.capacity ?? 0) - (usage.find(u => u.scheduleId === id)?._sum.bottles ?? 0)) }
  }), week)
  const drops = days.filter(day => day.open).map(day => describeDrop(day.id, day.capacity, day.remaining))
  const queue = await db().order.findMany({ where: { scheduleId: drops[0]?.id || '', status: { notIn: ['pending_payment', 'rejected'] } }, select: { tag: true, customer: { select: { name: true } } }, orderBy: { createdAt: 'desc' }, take: 6 })
  const [products, varieties] = await Promise.all([
    db().product.findMany({ where: { active: true }, orderBy: { sortOrder: 'asc' }, select: { id: true, name: true, size: true, description: true, kind: true, price: true } }),
    catalogStock(db()),
  ])
  return { week, days, drops, products, varieties, queue: queue.map(q => ({ tag: q.tag, name: q.customer.name.split(' ')[0] })) }
})
