export default defineEventHandler(async event => {
  requireAdmin(event)
  return { products: await productCatalog(db(), true), varieties: await db().caneVariety.findMany({ orderBy: { sortOrder: 'asc' } }) }
})
