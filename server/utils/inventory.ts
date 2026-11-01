import type { Prisma } from '../../generated/prisma/client'
import { malaysiaToday } from '../../shared/domain'
type Database = Prisma.TransactionClient

export async function lockVarieties(tx: Database, ids: string[]) {
  for (const id of [...new Set(ids)].sort()) {
    const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM cane_varieties WHERE id = ${id} FOR UPDATE`
    if (!rows.length) throw createError({ statusCode: 400, message: 'Choose an existing tebu variety.' })
  }
}
export async function varietyStock(tx: Database, id: string) {
  const [output, used] = await Promise.all([
    tx.harvest.aggregate({ where: { varietyId: id, date: { lte: new Date(`${malaysiaToday()}T00:00:00Z`) } }, _sum: { flaskQty: true, jugQty: true } }),
    tx.orderItem.groupBy({ by: ['productId'], where: { productId: { in: ['flask', 'jug'] }, order: { varietyId: id, status: { not: 'rejected' }, OR: [{ status: { not: 'pending_payment' } }, { expiresAt: { gt: new Date() } }] } }, _sum: { quantity: true } }),
  ])
  const flaskQty = output._sum.flaskQty ?? 0
  const jugQty = output._sum.jugQty ?? 0
  return { flaskQty, jugQty, flaskRemaining: flaskQty - (used.find(row => row.productId === 'flask')?._sum.quantity ?? 0), jugRemaining: jugQty - (used.find(row => row.productId === 'jug')?._sum.quantity ?? 0) }
}
export async function catalogStock(tx: Database) {
  const varieties = await tx.caneVariety.findMany({ orderBy: { sortOrder: 'asc' } })
  return Promise.all(varieties.map(async row => ({ id: row.id, name: row.name, description: row.description, ...await varietyStock(tx, row.id) })))
}
export async function ensureStockNotOversold(tx: Database, ids: string[]) {
  for (const id of new Set(ids)) {
    const stock = await varietyStock(tx, id)
    if (stock.flaskRemaining < 0 || stock.jugRemaining < 0) throw createError({ statusCode: 409, message: 'These bottles are already reserved or sold. Keep enough stock for existing orders.' })
  }
}

/** Caller holds the schedule row lock, shared by online and manual checkout. */
export async function dailyBottleUsage(tx: Database, scheduleId: string) {
  const rows = await tx.orderItem.groupBy({ by: ['productId'], where: { productId: { in: ['flask', 'jug'] }, order: { scheduleId, status: { not: 'rejected' }, OR: [{ status: { not: 'pending_payment' } }, { expiresAt: { gt: new Date() } }] } }, _sum: { quantity: true } })
  return { flask: rows.find(row => row.productId === 'flask')?._sum.quantity ?? 0, jug: rows.find(row => row.productId === 'jug')?._sum.quantity ?? 0 }
}
export async function ensureDailyCapacity(tx: Database, schedule: { id: string; capacity: number; flaskCapacity: number; jugCapacity: number }, cart: { flask: number; jug: number }) {
  const used = await dailyBottleUsage(tx, schedule.id)
  if (used.flask + cart.flask > schedule.flaskCapacity || used.jug + cart.jug > schedule.jugCapacity || used.flask + used.jug + cart.flask + cart.jug > schedule.capacity) {
    throw createError({ statusCode: 409, message: 'This day does not have enough space for these bottle sizes. Choose fewer bottles or another date.' })
  }
}
