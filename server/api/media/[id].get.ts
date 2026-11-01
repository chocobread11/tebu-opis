import { readFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
export default defineEventHandler(async event => {
  const id = getRouterParam(event, 'id') || ''
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw createError({ statusCode: 404, message: 'Image not found.' })
  const file = await db().media.findUnique({ where: { id } })
  if (!file) throw createError({ statusCode: 404, message: 'Image not found.' })
  if (file.kind === 'receipt') requireAdmin(event)
  else if (!isAdmin(event)) { const published = await db().schedule.findFirst({ where: { id: file.scheduleId ?? '', photoId: file.id } }); if (!published) throw createError({ statusCode: 404, message: 'Image not published yet.' }) }
  setHeader(event, 'Content-Type', 'image/webp'); setHeader(event, 'Content-Disposition', 'inline; filename="tebu-drop.webp"')
  try { return await readFile(join(resolve(useRuntimeConfig().uploadDir), file.filename)) }
  catch { throw createError({ statusCode: 404, message: 'Image is unavailable. Ask the operator to restore it.' }) }
})
