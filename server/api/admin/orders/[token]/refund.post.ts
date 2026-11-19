import { z } from 'zod'
import { paymentStatus } from '../../../../../shared/payment'
const input=z.object({requestId:z.uuid(),amount:z.number().int().min(1).max(2147483647),reason:z.string().trim().min(3).max(300),cancelOrder:z.boolean().default(false)}).strict()
export default defineEventHandler(async event=>{
 requireAdmin(event)
 const parsed=input.safeParse(await readBody(event));if(!parsed.success)throw createError({statusCode:400,message:'Enter the refund amount and reason.'})
 const initial=await findOrder(getRouterParam(event,'token')||'')
 const order=await db().$transaction(async tx=>{
  await tx.$queryRaw`SELECT id FROM schedules WHERE id=${initial.scheduleId} FOR UPDATE`
  await tx.$queryRaw`SELECT id FROM orders WHERE id=${initial.id}::uuid FOR UPDATE`
  const current=await tx.order.findUniqueOrThrow({where:{id:initial.id}}),data=parsed.data
  if(current.scheduleId!==initial.scheduleId)throw createError({statusCode:409,message:'This order changed. Refresh and try again.'})
  const retry=await tx.refund.findUnique({where:{requestId:data.requestId}})
  if(retry){if(retry.orderId!==current.id||retry.amount!==data.amount||retry.reason!==data.reason||retry.cancelOrder!==data.cancelOrder)throw createError({statusCode:409,message:'This refund request changed.'});return current}
  if(paymentStatus(current)!=='paid'&&!current.refundedTotal)throw createError({statusCode:409,message:'Only payments already received can be refunded.'})
  if(current.refundedTotal+data.amount>current.total)throw createError({statusCode:409,message:'The refund exceeds the payment remaining on this order.'})
  if(data.cancelOrder&&(current.fulfilled||current.status==='collected'||current.refundedTotal+data.amount!==current.total))throw createError({statusCode:409,message:'Only a fully refunded, uncollected order can be cancelled. Collected items stay recorded.'})
  await tx.refund.create({data:{orderId:current.id,...data}})
  const result=await tx.order.update({where:{id:current.id},data:{refundedTotal:{increment:data.amount},...(data.cancelOrder?{status:'rejected',cancellationReason:data.reason,packed:false,notified:false}:{})}})
  await recordAudit(tx,'order',current.id,'refund_recorded',current,result,data.reason)
  return result
 })
 return {order:await toTicket(order,true)}
})
