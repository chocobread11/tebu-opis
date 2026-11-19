import { queueTelegramOrder, dispatchTelegramNotifications } from '../../utils/telegram-notifications'
import { z } from 'zod'
const input = z.discriminatedUnion('action', [z.object({ action: z.literal('collect') }), z.object({ action: z.literal('receipt'), receiptId: z.uuid() })])
export default defineEventHandler(async event => {
  const order = await findOrder(getRouterParam(event, 'token') || '')
  const data = input.safeParse(await readBody(event)); if (!data.success) throw createError({ statusCode: 400, message: 'Invalid ticket update.' })
  if (data.data.action === 'collect') {
    const result=await db().$transaction(async tx=>{
      await tx.$queryRaw`SELECT id FROM orders WHERE id=${order.id}::uuid FOR UPDATE`
      const current=await tx.order.findUniqueOrThrow({where:{id:order.id}})
      if(current.status==='collected')return current
      if(current.status!=='ready')throw createError({statusCode:409,message:'Your bottle is not ready for pickup yet.'})
      const updated=await tx.order.update({where:{id:order.id},data:{status:'collected',fulfilled:true}})
      await recordAudit(tx,'order',order.id,'collected',current,updated,'','customer')
      return updated
    })
    return toTicket(result)
  }
  await authorizeReceipt(event, order)
  const ticket = await db().$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM schedules WHERE id = ${order.scheduleId} FOR UPDATE`
    const schedule = await tx.schedule.findUnique({ where: { id: order.scheduleId } })
    if (!schedule?.open || schedule.removedAt || schedule.droppedAt) throw createError({ statusCode: 409, message: 'This delivery day is closed. Contact the operator if you have paid.' })
    const receipt = await tx.media.findFirst({ where: { id: data.data.action === 'receipt' ? data.data.receiptId : '', orderId: order.id, kind: 'receipt' } })
    if (!receipt) throw createError({ statusCode: 400, message: 'Upload your receipt first.' })
    const [updated] = await tx.order.updateManyAndReturn({ data: { receiptId: receipt.id, status: 'pending_review' }, where: { id: order.id, status: 'pending_payment', expiresAt: { gt: new Date() } } })
    if (!updated) {
      const current = await tx.order.findUniqueOrThrow({ where: { id: order.id } })
      if (current.receiptId === receipt.id && current.status !== 'rejected') return toTicket(current, false, tx)
      throw createError({ statusCode: 409, message: 'The reservation has expired or already been submitted. Contact the operator if you have paid.' })
    }
    await recordAudit(tx,'order',order.id,'receipt_submitted',order,updated,'','customer')
    const ticket = await toTicket(updated, false, tx)
    if (!updated.manualPaymentStatus) await queueTelegramOrder(tx, order.id, {
      token: ticket.token, tag: ticket.tag, customerName: ticket.name, scheduleId: ticket.scheduleId, total: ticket.total, remarks: updated.remarks,
      items: ticket.items!.map(item => ({name:item.name,size:item.size,quantity:item.quantity})),
    }, receipt.id)
    return ticket
  })
  event.waitUntil(dispatchTelegramNotifications())
  return ticket
})
