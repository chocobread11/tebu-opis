export default defineEventHandler(async event => {
  requireAdmin(event)
  const initial = await findOrder(getRouterParam(event, 'token') || '')
  await db().$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM schedules WHERE id = ${initial.scheduleId} FOR UPDATE`
    if (initial.varietyId) await lockVarieties(tx, [initial.varietyId])
    await tx.$queryRaw`SELECT id FROM orders WHERE id = ${initial.id}::uuid FOR UPDATE`
    const current = await tx.order.findUnique({ where: { id: initial.id } })
    if (!current || current.scheduleId !== initial.scheduleId || current.varietyId !== initial.varietyId) throw createError({ statusCode: 409, message: 'This order changed. Refresh and try again.' })
    if(current.fulfilled||current.status==='collected'||current.refundedTotal||(!current.manualPaymentStatus&&['confirmed','ready'].includes(current.status))||current.manualPaymentStatus==='paid'&&current.status!=='rejected')throw createError({statusCode:409,message:'Keep paid, refunded and collected orders in the log. Record a cancellation or refund instead.'})
    const items=await tx.orderItem.findMany({where:{orderId:current.id}})
    await recordAudit(tx,'order',current.id,'deleted',{...current,items})
    await tx.order.update({ where: { id: current.id }, data: { receiptId: null } })
    await tx.media.deleteMany({ where: { orderId: current.id } })
    await tx.order.delete({ where: { id: current.id } })
  })
  return { ok: true }
})
