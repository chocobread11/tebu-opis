import { createMediaStorage, MediaStorageConfigurationError } from '../../storage/media'
export default defineEventHandler(async event => {
  const id = getRouterParam(event, 'id') || ''
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw createError({ statusCode: 404, message: 'Image not found.' })
  const file = await db().media.findUnique({ where: { id } })
  if (!file) throw createError({ statusCode: 404, message: 'Image not found.' })
  if (file.kind === 'receipt') requireAdmin(event)
  else if (!isAdmin(event)) { const published = await db().schedule.findFirst({ where: { id: file.scheduleId ?? '', photoId: file.id } }); if (!published) throw createError({ statusCode: 404, message: 'Image not published yet.' }) }
  setHeader(event, 'Content-Type', 'image/webp'); setHeader(event, 'Content-Disposition', 'inline; filename="tebu-drop.webp"')
  const storage = createMediaStorage(useRuntimeConfig())
  try { return await storage.read(file.filename) }
  catch (error: any) {
    if (error instanceof MediaStorageConfigurationError) throw createError({ statusCode: 503, message: error.message })
    if (error.code === 'ENOENT' || error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404) throw createError({ statusCode: 404, message: 'Image is unavailable. Ask the operator to restore it.' })
    throw createError({ statusCode: 503, message: 'Image storage is temporarily unavailable.' })
  } finally { storage.close() }
})
