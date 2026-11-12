import { malaysiaToday, describeDrop, activeOrderingWeek, testingOrderingWindow, publicDeliveryDays, boxAvailability } from '../../shared/domain'
export default defineEventHandler(async () => {
  const testing = String(useRuntimeConfig().public.testingCalendar) === 'true'
  // Production: const week = activeOrderingWeek()
  const week = testing ? testingOrderingWindow() : activeOrderingWeek()
  const today = malaysiaToday()
  const rows = await db().schedule.findMany({ where: { id: { gte: week.start, lte: week.end } }, orderBy: { id: 'asc' } })
  const sizeUsage = await Promise.all(rows.map(async row => ({ id: row.id, ...await dailyBottleUsage(db(), row.id) })))
  const days = publicDeliveryDays(week.days.map(id => {
    const row = rows.find(schedule => schedule.id === id)
    const used = sizeUsage.find(usage => usage.id === id)
    return { id, ...boxAvailability(row?.capacity ?? 0, used ?? { kecik: 0, besar: 0 }), open: !!row?.open && !row.removedAt && !row.droppedAt && (testing ? id >= today : id > today) }
  }), week, new Date(), testing)
  const drops = days.filter(day => day.open).map(day => describeDrop(day.id, day.capacity, day.remaining))
  const [products, varieties] = await Promise.all([
    db().product.findMany({ where: { active: true }, orderBy: { sortOrder: 'asc' }, select: { id: true, name: true, size: true, description: true, kind: true, price: true } }),
    catalogStock(db()),
  ])
  return { week, days, drops, products, varieties }
})
