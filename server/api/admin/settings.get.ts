export default defineEventHandler(async event => {
  requireAdmin(event)
  return shopSettings()
})
