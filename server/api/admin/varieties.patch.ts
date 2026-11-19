export default defineEventHandler(async event => {
  requireAdmin(event)
  throw createError({ statusCode: 410, message: 'Edit each product directly in Products & inventory.' })
})
