import { z } from 'zod'
const input = z.discriminatedUnion('action', [
  z.object({ action: z.enum(['approve', 'reject', 'pack', 'notify']), orderToken: z.string() }),
  z.object({ action: z.literal('manual-payment'), orderToken: z.string(), paymentStatus: z.enum(['paid', 'unpaid']) }),
  z.object({ action: z.literal('cancel-manual'), orderToken: z.string() }),
  z.object({ action: z.literal('drop'), scheduleId: z.string(), photoId: z.uuid() }),
])
export default defineEventHandler(async event => {
  requireAdmin(event)
  const parsed = input.safeParse(await readBody(event)); if (!parsed.success) throw createError({ statusCode: 400, message: 'Invalid operation.' })
  const data = parsed.data
  if (data.action === 'drop') {
    await db().$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM schedules WHERE id = ${data.scheduleId} FOR UPDATE`
      const schedule = await tx.schedule.findUnique({ where: { id: data.scheduleId } })
      if (!schedule) throw createError({ statusCode: 404, message: 'Drop not found.' })
      const photo = await tx.media.findFirst({ where: { id: data.photoId, scheduleId: schedule.id, kind: 'freezer' } })
      if (!photo) throw createError({ statusCode: 400, message: 'Upload the freezer photo for this drop first.' })
      const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kuala_Lumpur', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
      if (schedule.id > today) throw createError({ statusCode: 409, message: 'The pantry drop can only be published on or after its scheduled day.' })
      await tx.schedule.update({ data: { photoId: photo.id, droppedAt: new Date(), open: false }, where: { id: schedule.id } })
      await tx.order.updateMany({ data: { status: 'ready' }, where: { scheduleId: schedule.id, status: 'confirmed', packed: true } })
    })
    return { ok: true }
  }
  const order = await findOrder(data.orderToken)
  if (data.action === 'manual-payment' || data.action === 'cancel-manual') {
    const updated = await db().order.updateMany({ where: { id: order.id, manualPaymentStatus: { not: null }, status: { not: 'rejected' } }, data: data.action === 'manual-payment' ? { manualPaymentStatus: data.paymentStatus } : { status: 'rejected' } })
    if (!updated.count) throw createError({ statusCode: 409, message: 'This manual order is cancelled or no longer available.' })
    return { ok: true }
  }
  const allowed = { approve: 'pending_review', reject: 'pending_review', pack: 'confirmed', notify: 'ready' } as const
  const expected = allowed[data.action]
  const changes = data.action === 'approve' ? { status: 'confirmed' as const } : data.action === 'reject' ? { status: 'rejected' as const } : data.action === 'pack' ? { packed: !order.packed } : { notified: true }
  const updated = await db().order.updateMany({ data: changes, where: { id: order.id, status: expected } })
  if (!updated.count) throw createError({ statusCode: 409, message: 'The order status changed. Refresh and try again.' })
  return { ok: true }
})
