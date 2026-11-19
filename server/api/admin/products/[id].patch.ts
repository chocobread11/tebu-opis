export default defineEventHandler(async event => {
  requireAdmin(event)
  const id = getRouterParam(event,'id') || ''
  const input = productInput.safeParse(await readBody(event))
  if (!input.success) throw createError({ statusCode: 400, message: 'Enter valid product details.' })
  return db().$transaction(async tx => {
    await lockProducts(tx,[id])
    const current = await tx.product.findUniqueOrThrow({ where: { id } })
    if (current.varietyTracked !== input.data.varietyTracked && (await tx.orderItem.count({ where: { productId: id } }) || await tx.stockEntry.count({ where: { productId: id } }) || ['kecik','besar'].includes(id))) throw createError({ statusCode: 409, message: 'Stock grouping cannot change after use. Create a new product for a different grouping.' })
    const product = await tx.product.update({ where: { id }, data: input.data })
    if (product.trackStock) {
      const variants = product.varietyTracked ? (await tx.caneVariety.findMany()).map(v => v.id) : [null]
      for (const variant of variants) if ((await productStock(tx,product,variant)).remaining < 0) throw createError({ statusCode: 409, message: 'Log enough stock before enabling tracking for reserved items.' })
    }
    await recordAudit(tx,'product',id,'edited',current,product)
    return product
  })
})
