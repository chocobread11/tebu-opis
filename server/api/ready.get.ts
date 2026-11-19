export default defineEventHandler(async event => {
  try {
    // Check both the connection and the schema required for checkout/settings.
    const schema = await db().$queryRaw<{ ready: boolean }[]>`SELECT to_regprocedure('next_order_tag()') IS NOT NULL AS ready`
    if (!schema[0]?.ready) throw new Error('Schema incomplete')
    await db().shopSettings.findUnique({ where: { id: 'main' } })
    return { status: 'ready' }
  } catch {
    setResponseStatus(event, 503)
    return { status: 'unavailable' }
  }
})
