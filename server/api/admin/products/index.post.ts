import { randomUUID } from 'node:crypto'
export default defineEventHandler(async event => {
  requireAdmin(event)
  const input = productInput.safeParse(await readBody(event))
  if (!input.success) throw createError({ statusCode: 400, message: 'Enter a name, unit, price, category and valid box-space settings.' })
  const slug = input.data.name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,60) || 'product'
  return db().$transaction(async tx=>{const product=await tx.product.create({data:{id:`${slug}-${randomUUID().slice(0,8)}`,...input.data}});await recordAudit(tx,'product',product.id,'created',undefined,product);return product})
})
