import { z } from 'zod'
export default defineEventHandler(async event => {
  requireAdmin(event)
  const id = getRouterParam(event,'id') || ''
  if (!z.uuid().safeParse(id).success) throw createError({ statusCode: 400, message: 'Invalid stock entry.' })
  return saveStockEntry(await readBody(event),id)
})
