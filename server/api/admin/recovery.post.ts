import {z} from 'zod'
import {normalizePhone} from '../../../shared/domain'
const input=z.object({phone:z.string().max(20),verified:z.literal(true)}).strict()
export default defineEventHandler(async event=>{
 requireAdmin(event)
 const parsed=input.safeParse(await readBody(event));if(!parsed.success)throw createError({statusCode:400,message:'Verify the customer before creating a recovery link.'})
 let phone:string;try{phone=normalizePhone(parsed.data.phone)}catch{throw createError({statusCode:400,message:'Enter a valid mobile number.'})}
 const token=newToken(),expiresAt=new Date(Date.now()+30*60000)
 await db().$transaction(async tx=>{
  const customer=await tx.customer.findUnique({where:{phone}});if(!customer)throw createError({statusCode:404,message:'Customer not found.'})
  await tx.$queryRaw`SELECT id FROM customers WHERE id=${customer.id}::uuid FOR UPDATE`
  await tx.passwordRecovery.deleteMany({where:{customerId:customer.id}})
  await tx.passwordRecovery.create({data:{tokenHash:hashToken(token),customerId:customer.id,expiresAt}})
  await recordAudit(tx,'customer',customer.id,'recovery_issued',undefined,{phone:customer.phone,expiresAt},'Operator verified customer identity')
 })
 const origin=String((await shopSettings()).siteUrl||getRequestURL(event,{xForwardedHost:true,xForwardedProto:true}).origin)
 const url=new URL('/recover',origin);url.hash=token
 return {url:url.toString(),expiresAt:expiresAt.toISOString()}
})
