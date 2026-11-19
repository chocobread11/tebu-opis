import { guardOrderChange } from '../../utils/order-guards'
import { z } from 'zod'
const input = z.discriminatedUnion('action', [
  z.object({ action: z.literal('approve'), orderToken: z.string() }),
  z.object({ action: z.literal('reject'), orderToken: z.string() }),
  z.object({ action: z.literal('notify'), orderToken: z.string(), notified: z.boolean().optional() }),
  z.object({ action: z.literal('pack'), orderToken: z.string(), packed: z.boolean().optional() }),
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
      const readyOrders=await tx.order.findMany({where:{scheduleId:schedule.id,status:'confirmed',packed:true}})
      await tx.schedule.update({ data: { photoId: photo.id, droppedAt: schedule.droppedAt || new Date(), open: false }, where: { id: schedule.id } })
      await tx.order.updateMany({ data: { status: 'ready' }, where: { scheduleId: schedule.id, status: 'confirmed', packed: true } })
      for(const order of readyOrders)await recordAudit(tx,'order',order.id,'ready',order,{...order,status:'ready'})
      await recordAudit(tx,'schedule',schedule.id,'published',schedule,{photoId:photo.id,readyOrders:readyOrders.length})
    })
    return { ok: true }
  }
  const initial = await findOrder(data.orderToken)
  const updated=await db().$transaction(async tx=>{
    await tx.$queryRaw`SELECT id FROM schedules WHERE id=${initial.scheduleId} FOR UPDATE`
    await tx.$queryRaw`SELECT id FROM orders WHERE id=${initial.id}::uuid FOR UPDATE`
    const order=await tx.order.findUniqueOrThrow({where:{id:initial.id}})
    if(order.scheduleId!==initial.scheduleId)throw createError({statusCode:409,message:'This order changed. Refresh and try again.'})
    let changes: Record<string, unknown>
    if(data.action==='manual-payment'||data.action==='cancel-manual'){
      if(!order.manualPaymentStatus||order.status==='rejected')throw createError({statusCode:409,message:'This manual order is cancelled or unavailable.'})
      if(data.action==='cancel-manual'){guardOrderChange(order,{status:'rejected'});changes={status:'rejected',cancellationReason:'Cancelled by operator'}}
      else {if(order.refundedTotal&&data.paymentStatus==='unpaid')throw createError({statusCode:409,message:'This order has a recorded refund. Keep its payment record.'});changes={manualPaymentStatus:data.paymentStatus}}
    } else if(data.action==='notify'){
      if(!['confirmed','ready','collected'].includes(order.status))throw createError({statusCode:409,message:'This order is no longer in the drop checklist.'})
      changes={notified:data.notified??true}
    } else {
      const expected={approve:'pending_review',reject:'pending_review',pack:'confirmed'} as const
      if(order.status!==expected[data.action])throw createError({statusCode:409,message:'The order status changed. Refresh and try again.'})
      changes=data.action==='approve'?{status:'confirmed'}:data.action==='reject'?{status:'rejected'}:{packed:data.packed??!order.packed}
    }
    const result=await tx.order.update({where:{id:order.id},data:changes})
    await recordAudit(tx,'order',order.id,data.action,order,result)
    return result
  })
  return {ok:true,order:await toTicket(updated,true)}
})
