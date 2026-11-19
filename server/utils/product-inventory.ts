import { z } from 'zod'
import { createError } from 'h3'
import type { Prisma, Product } from '../../generated/prisma/client'
import { malaysiaToday, bottleCount, type Cart } from '../../shared/domain'
type Database = Prisma.TransactionClient
export const cartInput = z.record(z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/), z.number().int().min(0).max(10000)).refine(cart => Object.values(cart).filter(qty => qty > 0).length <= 100 && Object.values(cart).some(qty => qty > 0), 'Choose at least one item.')
export const reservedOrder = () => ({ status: { not: 'rejected' }, OR: [{ status: { not: 'pending_payment' } }, { expiresAt: { gt: new Date() } }] })
export async function lockProducts(tx: Database, ids: string[]) {
  for (const id of [...new Set(ids)].sort()) {
    const rows = await tx.$queryRaw`SELECT id FROM products WHERE id=${id} FOR UPDATE`
    if (!(rows as unknown[]).length) throw createError({ statusCode: 409, message: 'A product is no longer available.' })
  }
}
export async function productStock(tx: Database, product: Product, varietyId?: string | null) {
  const [restocks, sales] = await Promise.all([
    tx.stockEntry.aggregate({ where: { productId: product.id, date: { lte: new Date(`${malaysiaToday()}T00:00:00Z`) } }, _sum: { quantity: true } }),
    tx.orderItem.aggregate({ where: { productId: product.id, order: reservedOrder() }, _sum: { quantity: true } }),
  ])
  const stocked = restocks._sum.quantity ?? 0, reserved = sales._sum.quantity ?? 0
  return { stocked, reserved, remaining: stocked - reserved }
}
export async function productCatalog(tx: Database, admin = false) {
  const rows = await tx.product.findMany({ where: admin ? {} : { active: true }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] })
  return Promise.all(rows.map(async p => ({ ...p, imageUrl: p.imageId ? `/api/media/${p.imageId}` : undefined, stocks: [await productStock(tx, p)] })))
}
export async function orderCatalog(tx: Database, cart: Cart, varietyId?: string | null, allowInactive = false) {
  const ids = Object.keys(cart).filter(id => (cart[id] ?? 0) > 0)
  await lockProducts(tx, ids)
  const catalog = await tx.product.findMany({ where: { id: { in: ids }, ...(allowInactive ? {} : { active: true }) } })
  if (catalog.length !== ids.length) throw createError({ statusCode: 409, message: 'A product is no longer available.' })
  if (!allowInactive && !bottleCount(cart, catalog)) throw createError({ statusCode: 400, message: 'Choose at least one main product.' })
  return catalog
}
export async function ensureCartStock(tx: Database, catalog: Product[], cart: Cart, varietyId?: string | null) {
  for (const p of catalog.filter(p => p.trackStock)) {
    const stock = await productStock(tx, p, varietyId)
    if ((cart[p.id] || 0) > stock.remaining) throw createError({ statusCode: 409, message: `Not enough ${p.name} in stock. Refresh and choose an available quantity.` })
  }
}
export function orderLines(catalog: Product[], cart: Cart) {
  return catalog.map(p => ({ productId: p.id, quantity: cart[p.id] ?? 0, unitPrice: p.price, name: p.name, size: p.size, kind: p.kind, spaceCost: p.spaceCost }))
}
