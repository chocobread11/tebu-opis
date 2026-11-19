import type { Prisma } from '../../generated/prisma/client'
import { createError } from 'h3'
import { productStock, reservedOrder } from './product-inventory'
import { malaysiaToday, bottleSpaces } from '../../shared/domain'
type Database = Prisma.TransactionClient

export async function lockVarieties(tx: Database, ids: string[]) {
  for (const id of [...new Set(ids)].sort()) {
    const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM cane_varieties WHERE id = ${id} FOR UPDATE`
    if (!rows.length) throw createError({ statusCode: 400, message: 'Choose an existing tebu variety.' })
  }
}
// The variety list is retained only for reading historical records.
export async function catalogStock(tx: Database) {
  const varieties = await tx.caneVariety.findMany({ orderBy: { sortOrder: 'asc' } })
  return varieties.map(row => ({ id: row.id, name: row.name, description: row.description, kecikQty: 0, besarQty: 0, kecikRemaining: 0, besarRemaining: 0 }))
}
export async function ensureStockNotOversold(tx: Database, ids: string[]) {
  const products = await tx.product.findMany({ where: { trackStock: true } })
  for (const product of products) {
    const stock = await productStock(tx, product)
    if (stock.remaining < 0) throw createError({ statusCode: 409, message: `${product.name} is already reserved. Keep enough stock for existing orders.` })
  }
}

/** Caller holds the schedule row lock, shared by online and manual checkout. */
export async function dailyBottleUsage(tx: Database, scheduleId: string) {
  const rows = await tx.orderItem.findMany({ where: { order: { scheduleId, ...reservedOrder() } }, include: { product: true } })
  const items: { productId: string; name: string; quantity: number; spaceCost: number }[] = []
  for (const row of rows) {
    const cost = row.kind ? row.spaceCost : row.product.spaceCost
    if (!cost) continue
    const existing = items.find(item => item.productId === row.productId && item.spaceCost === cost)
    if (existing) existing.quantity += row.quantity
    else items.push({ productId: row.productId, name: row.name || row.product.name, quantity: row.quantity, spaceCost: cost })
  }
  return { kecik: rows.filter(r => r.productId === 'kecik').reduce((n,r) => n+r.quantity,0), besar: rows.filter(r => r.productId === 'besar').reduce((n,r) => n+r.quantity,0), spaces: items.reduce((n,item) => n+item.quantity*item.spaceCost,0), items }
}
export async function ensureDailyCapacity(tx: Database, schedule: { id: string; capacity: number }, cart: Partial<import('../../shared/domain').Cart>, catalog?: import('../../generated/prisma/client').Product[]) {
  const used = await dailyBottleUsage(tx, schedule.id)
  if (used.spaces + bottleSpaces(cart, catalog ?? await tx.product.findMany()) > schedule.capacity) {
    throw createError({ statusCode: 409, message: 'This box does not have enough space. Choose fewer items or another date.' })
  }
}
