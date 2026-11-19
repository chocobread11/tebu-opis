import { receiptOrigin } from '../../../../utils/receipt-origin'
export default defineEventHandler(async event=>{
 requireAdmin(event)
 const initial=await findOrder(getRouterParam(event,'token')||'')
 const order=await db().$transaction(async tx=>{
  await tx.$queryRaw`SELECT id FROM schedules WHERE id=${initial.scheduleId} FOR UPDATE`
  await tx.$queryRaw`SELECT id FROM orders WHERE id=${initial.id}::uuid FOR UPDATE`
  const current=await tx.order.findUniqueOrThrow({where:{id:initial.id}})
  if(current.scheduleId!==initial.scheduleId)throw createError({statusCode:409,message:'This order changed. Refresh and try again.'})
  if(current.manualPaymentStatus||current.fulfilled||current.refundedTotal||!['pending_payment','rejected'].includes(current.status))throw createError({statusCode:409,message:'Only an unpaid, uncollected online order can be reopened.'})
  const schedule=await tx.schedule.findUniqueOrThrow({where:{id:current.scheduleId}})
  if(!schedule.open||schedule.droppedAt||schedule.removedAt)throw createError({statusCode:409,message:'Move this order to an open delivery date before reopening receipt upload.'})
  const items=await tx.orderItem.findMany({where:{orderId:current.id}});await lockProducts(tx,items.map(item=>item.productId))
  const result=await tx.order.update({where:{id:current.id},data:{status:'pending_payment',expiresAt:new Date(Date.now()+20*60000),packed:false,notified:false,cancellationReason:null}})
  await ensureDailyCapacity(tx,schedule,{})
  await ensureStockNotOversold(tx,[])
  await recordAudit(tx,'order',current.id,'receipt_reopened',current,result)
  return result
 })
 const customer=await db().customer.findUniqueOrThrow({where:{id:order.customerId}})
 const origin=receiptOrigin(getRequestURL(event,{xForwardedHost:true,xForwardedProto:true}).origin,(await shopSettings()).siteUrl,import.meta.dev)
 const url=new URL(`/receipt/${order.token}`,origin);url.hash=receiptUploadSignature(order,customer.tokenHash)
 return {order:await toTicket(order,true),receiptUploadUrl:url.toString()}
})
