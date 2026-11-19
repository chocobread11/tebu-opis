import {normalizePhone} from '../../../shared/domain'
export default defineEventHandler(async event=>{
 requireAdmin(event)
 let phone:string;try{phone=normalizePhone(String(getQuery(event).phone||''))}catch{throw createError({statusCode:400,message:'Enter the customer mobile number.'})}
 const customer=await db().customer.findUnique({where:{phone},select:{id:true,name:true,phone:true,passwordHash:true,_count:{select:{orders:true}}}})
 return {customer:customer?{name:customer.name,phone:customer.phone,protected:!!customer.passwordHash,orders:customer._count.orders}:null}
})
