import {z} from 'zod'
const input=z.object({entityType:z.string().max(40).optional(),entityId:z.string().max(80).optional(),page:z.coerce.number().int().min(1).default(1),pageSize:z.coerce.number().pipe(z.union([z.literal(10),z.literal(20),z.literal(50),z.literal(100)])).default(20)})
export default defineEventHandler(async event=>{
 requireAdmin(event)
 const parsed=input.safeParse(getQuery(event));if(!parsed.success)throw createError({statusCode:400,message:'Choose a valid audit page.'})
 const {pageSize,entityType,entityId}=parsed.data,where={...(entityType?{entityType}:{}),...(entityId?{entityId}:{})}
 const total=await db().auditEvent.count({where}),page=Math.min(parsed.data.page,Math.max(1,Math.ceil(total/pageSize)))
 return {total,page,entries:await db().auditEvent.findMany({where,orderBy:[{createdAt:'desc'},{id:'desc'}],skip:(page-1)*pageSize,take:pageSize})}
})
