import { z } from 'zod'
const input = z.discriminatedUnion('action', [z.object({ action: z.literal('collect') }), z.object({ action: z.literal('receipt'), receiptId: z.uuid() })])
export default defineEventHandler(async event => {
  const order = await findOrder(getRouterParam(event, 'token') || '')
  const data = input.safeParse(await readBody(event)); if (!data.success) throw createError({ statusCode: 400, message: 'Invalid ticket update.' })
  if (data.data.action === 'collect') {
    if (order.status === 'collected') return toTicket(order)
    const [updated] = await db().order.updateManyAndReturn({ data: { status: 'collected' }, where: { id: order.id, status: 'ready' } })
    if (!updated) throw createError({ statusCode: 409, message: 'Your bottle is not ready for pickup yet.' })
    return toTicket(updated)
  }
  const customer = await requireCustomer(event)
  if (order.customerId !== customer.id) throw createError({ statusCode: 403, message: 'This receipt belongs to another customer.' })
  return db().$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM schedules WHERE id = ${order.scheduleId} FOR UPDATE`
    const schedule = await tx.schedule.findUnique({ where: { id: order.scheduleId } })
    if (!schedule?.open || schedule.removedAt || schedule.droppedAt) throw createError({ statusCode: 409, message: 'This delivery day is closed. Contact the operator if you have paid.' })
    const receipt = await tx.media.findFirst({ where: { id: data.data.action === 'receipt' ? data.data.receiptId : '', orderId: order.id, kind: 'receipt' } })
    if (!receipt) throw createError({ statusCode: 400, message: 'Upload your receipt first.' })
    const [updated] = await tx.order.updateManyAndReturn({ data: { receiptId: receipt.id, status: 'pending_review' }, where: { id: order.id, status: 'pending_payment', expiresAt: { gt: new Date() } } })
    if (!updated) {
      const current = await tx.order.findUniqueOrThrow({ where: { id: order.id } })
      if (current.receiptId === receipt.id && current.status !== 'rejected') return toTicket(current)
      throw createError({ statusCode: 409, message: 'The reservation has expired or already been submitted. Contact the operator if you have paid.' })
    }
    return toTicket(updated)
  })
})
