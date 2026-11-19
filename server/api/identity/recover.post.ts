import {z} from 'zod'
import {customerSessionLifetime} from '../../../shared/session'
const input=z.object({token:z.string().regex(/^[\w-]{43}$/),password:z.string().min(8).max(128)}).strict()
export default defineEventHandler(async event=>{
 const parsed=input.safeParse(await readBody(event));if(!parsed.success)throw createError({statusCode:400,message:'Open a valid recovery link and use a password with at least 8 characters.'})
 const digest=hashToken(parsed.data.token),passwordHash=await hashPassword(parsed.data.password)
 const result=await db().$transaction(async tx=>{
  await tx.$queryRaw`SELECT token_hash FROM password_recoveries WHERE token_hash=${digest} FOR UPDATE`
  const recovery=await tx.passwordRecovery.findUnique({where:{tokenHash:digest}})
  if(!recovery||recovery.usedAt||recovery.expiresAt<=new Date())throw createError({statusCode:410,message:'This recovery link is used or expired. Ask the operator for a new link.'})
  const customer=await tx.customer.update({where:{id:recovery.customerId},data:{passwordHash,tokenHash:hashToken(newToken())}})
  await tx.customerSession.deleteMany({where:{customerId:recovery.customerId}})
  await tx.passwordRecovery.update({where:{tokenHash:digest},data:{usedAt:new Date()}})
  const token=newToken(),expiresAt=new Date(Date.now()+customerSessionLifetime)
  await tx.customerSession.create({data:{customerId:recovery.customerId,tokenHash:hashToken(token),expiresAt}})
  await recordAudit(tx,'customer',recovery.customerId,'password_recovered',undefined,{sessionsRevoked:true},'History preserved','customer')
  return {token,expiresAt,phone:customer.phone||''}
 })
 rememberCustomerSession(event,result.token,result.expiresAt)
 return {ok:true,phone:result.phone}
})
