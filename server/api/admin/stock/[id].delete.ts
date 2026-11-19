import { z } from 'zod'
export default defineEventHandler(async event => {
  requireAdmin(event)
  const id = getRouterParam(event,'id') || ''
  if (!z.uuid().safeParse(id).success) throw createError({ statusCode: 400, message: 'Invalid stock entry.' })
  await db().$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM stock_entries WHERE id=${id}::uuid FOR UPDATE`
    const entry = await tx.stockEntry.findUnique({ where: { id } })
    if (!entry) throw createError({ statusCode: 404, message: 'Stock entry not found.' })
    await lockProducts(tx,[entry.productId])
    await recordAudit(tx,'stock',entry.id,'deleted',entry)
    await tx.stockEntry.delete({ where: { id } })
    const product = await tx.product.findUniqueOrThrow({ where: { id:entry.productId } })
    if (product.trackStock && (await productStock(tx,product,entry.varietyId)).remaining < 0) throw createError({ statusCode: 409, message: 'This restock is needed for existing orders. It cannot be removed.' })
  })
  return { ok:true }
})
