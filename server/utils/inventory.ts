import type { Prisma } from '../../generated/prisma/client'
import { malaysiaToday, bottleSpaces } from '../../shared/domain'
type Database = Prisma.TransactionClient

export async function lockVarieties(tx: Database, ids: string[]) {
  for (const id of [...new Set(ids)].sort()) {
    const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM cane_varieties WHERE id = ${id} FOR UPDATE`
    if (!rows.length) throw createError({ statusCode: 400, message: 'Choose an existing tebu variety.' })
  }
}
export async function varietyStock(tx: Database, id: string) {
  const [output, used] = await Promise.all([
    tx.harvest.aggregate({ where: { varietyId: id, date: { lte: new Date(`${malaysiaToday()}T00:00:00Z`) } }, _sum: { kecikQty: true, besarQty: true } }),
    tx.orderItem.groupBy({ by: ['productId'], where: { productId: { in: ['kecik', 'besar'] }, order: { varietyId: id, status: { not: 'rejected' }, OR: [{ status: { not: 'pending_payment' } }, { expiresAt: { gt: new Date() } }] } }, _sum: { quantity: true } }),
  ])
  const kecikQty = output._sum.kecikQty ?? 0
  const besarQty = output._sum.besarQty ?? 0
  return { kecikQty, besarQty, kecikRemaining: kecikQty - (used.find(row => row.productId === 'kecik')?._sum.quantity ?? 0), besarRemaining: besarQty - (used.find(row => row.productId === 'besar')?._sum.quantity ?? 0) }
}
export async function catalogStock(tx: Database) {
  const varieties = await tx.caneVariety.findMany({ orderBy: { sortOrder: 'asc' } })
  return Promise.all(varieties.map(async row => ({ id: row.id, name: row.name, description: row.description, ...await varietyStock(tx, row.id) })))
}
export async function ensureStockNotOversold(tx: Database, ids: string[]) {
  for (const id of new Set(ids)) {
    const stock = await varietyStock(tx, id)
    if (stock.kecikRemaining < 0 || stock.besarRemaining < 0) throw createError({ statusCode: 409, message: 'These bottles are already reserved or sold. Keep enough stock for existing orders.' })
  }
}

/** Caller holds the schedule row lock, shared by online and manual checkout. */
export async function dailyBottleUsage(tx: Database, scheduleId: string) {
  const rows = await tx.orderItem.groupBy({ by: ['productId'], where: { productId: { in: ['kecik', 'besar'] }, order: { scheduleId, status: { not: 'rejected' }, OR: [{ status: { not: 'pending_payment' } }, { expiresAt: { gt: new Date() } }] } }, _sum: { quantity: true } })
  return { kecik: rows.find(row => row.productId === 'kecik')?._sum.quantity ?? 0, besar: rows.find(row => row.productId === 'besar')?._sum.quantity ?? 0 }
}
export async function ensureDailyCapacity(tx: Database, schedule: { id: string; capacity: number }, cart: { kecik: number; besar: number }) {
  const used = await dailyBottleUsage(tx, schedule.id)
  if (bottleSpaces(used) + bottleSpaces(cart) > schedule.capacity) {
    throw createError({ statusCode: 409, message: 'This box does not have enough space. Kecik uses 1 space and Besar uses 2. Choose fewer bottles or another date.' })
  }
}
