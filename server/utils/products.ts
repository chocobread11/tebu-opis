import { z } from 'zod'
import { malaysiaToday } from '../../shared/domain'
export const productInput = z.object({
  name: z.string().trim().min(2).max(80), size: z.string().trim().min(1).max(40), description: z.string().trim().max(300).default(''),
  kind: z.enum(['bottle','addon']), price: z.number().int().min(1).max(9999999),
  active: z.boolean().default(true), sortOrder: z.number().int().min(0).max(10000).default(0),
  spaceCost: z.number().int().min(0).max(4), trackStock: z.boolean(), varietyTracked: z.literal(false).default(false),
}).strict().refine(p => p.kind !== 'bottle' || p.spaceCost > 0, 'Main products need at least one box space.')
export const stockInput = z.object({ productId: z.string().min(1).max(80), varietyId: z.string().max(80).nullish(), date: z.iso.date(), kind:z.enum(['restock','adjustment']).default('restock'), quantity: z.number().int().min(-100000).max(100000), note: z.string().trim().max(300).default('') }).strict().refine(row=>row.kind==='restock'?row.quantity>0:row.quantity!==0&&row.note.length>=3,'Adjustments need a non-zero quantity and a reason.')
export async function saveStockEntry(value: unknown, id?: string) {
  const parsed = stockInput.safeParse(value)
  if (!parsed.success || parsed.data.date > malaysiaToday()) throw createError({ statusCode: 400, message: 'Choose a product, a date up to today, and a valid whole quantity. Adjustments also need a reason.' })
  return db().$transaction(async tx => {
    if(id) await tx.$queryRaw`SELECT id FROM stock_entries WHERE id=${id}::uuid FOR UPDATE`
    const existing = id ? await tx.stockEntry.findUnique({ where: { id } }) : null
    if (id && !existing) throw createError({ statusCode: 404, message: 'Stock entry not found.' })
    await lockProducts(tx, [parsed.data.productId, ...(existing ? [existing.productId] : [])])
    const product = await tx.product.findUniqueOrThrow({ where: { id: parsed.data.productId } })
    const varietyId = null
    const data = { ...parsed.data, varietyId: varietyId || null, date: new Date(`${parsed.data.date}T00:00:00Z`) }
    const entry = id ? await tx.stockEntry.update({ where: { id }, data }) : await tx.stockEntry.create({ data })
    for (const [productId, variant] of [[product.id,varietyId], ...(existing ? [[existing.productId,existing.varietyId]] : [])]) {
      const p = await tx.product.findUniqueOrThrow({ where: { id: productId! } })
      if (p.trackStock && (await productStock(tx,p,variant)).remaining < 0) throw createError({ statusCode: 409, message: 'Keep enough stock for existing orders.' })
    }
    await recordAudit(tx,'stock',entry.id,id?'edited':'created',existing,entry,entry.note)
    return entry
  })
}
