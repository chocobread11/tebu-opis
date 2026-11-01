export default defineEventHandler(async event => {
  requireAdmin(event)
  const id = getRouterParam(event, 'id') || ''
  requireFutureDate(id)
  await db().$transaction(async tx => {
    await tx.schedule.upsert({ where: { id }, update: {}, create: { id, open: false } })
    await tx.$queryRaw`SELECT id FROM schedules WHERE id = ${id} FOR UPDATE`
    const row = await tx.schedule.findUniqueOrThrow({ where: { id } })
    if (row.droppedAt) throw createError({ statusCode: 409, message: 'This drop has already been delivered.' })
    await tx.schedule.update({ where: { id }, data: { open: false, removedAt: new Date(), closedReason: 'Removed' } })
    await tx.order.updateMany({ where: { scheduleId: id, status: 'pending_payment' }, data: { status: 'rejected' } })
  })
  return { ok: true }
})
