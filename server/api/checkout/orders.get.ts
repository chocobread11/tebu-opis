export default defineEventHandler(async event=>{
 const session=await findCheckoutSession(event)
 if(!session)throw createError({statusCode:401,message:'This checkout session has expired.'})
 const orders=await db().order.findMany({where:{customerId:session.customerId,checkoutSessionHash:session.tokenHash},orderBy:{createdAt:'desc'},take:20})
 return {orders:await Promise.all(orders.map(order=>toTicket(order)))}
})
