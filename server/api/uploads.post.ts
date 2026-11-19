import { createMediaStorage, MediaStorageConfigurationError } from '../storage/media'
import { randomUUID } from 'node:crypto'
import { imageMimeTypes, imageUploadLimit } from '../../shared/media'
import { prepareUploadedImage } from '../utils/upload-image'
export default defineEventHandler(async event => {
  const parts = await readMultipartFormData(event)
  const orderToken = parts?.find(p => p.name === 'orderToken')?.data.toString()
  const admin = !orderToken && isAdmin(event)
  const file = parts?.find(p => p.name === 'file')
  if (!file || !(imageMimeTypes as readonly string[]).includes(file.type || '') || file.data.length >= imageUploadLimit) throw createError({ statusCode: 400, message: 'Upload a JPG, PNG or WebP image smaller than 250 KB.' })
  let orderId: string | undefined
  let scheduleId: string | undefined
  if (admin) {
    scheduleId = parts?.find(p => p.name === 'scheduleId')?.data.toString()
    if (!scheduleId || !/^\d{4}-\d{2}-\d{2}$/.test(scheduleId)) throw createError({ statusCode: 400, message: 'Select a valid drop day.' })
    const schedule = await db().schedule.findUnique({ where: { id: scheduleId } })
    if (!schedule) throw createError({ statusCode: 404, message: 'Drop not found.' })
  } else {
    const order = await findOrder(orderToken || '')
    await authorizeReceipt(event, order)
    if (order.status !== 'pending_payment' || order.expiresAt <= new Date()) throw createError({ statusCode: 403, message: 'This order is not accepting receipts. Contact the operator if you have paid.' })
    orderId = order.id
  }
  let bytes: Buffer
  try { bytes = await prepareUploadedImage(file.data) }
  catch { throw createError({ statusCode: 400, message: 'Image verification failed. Try a smaller screenshot.' }) }
  const id = randomUUID()
  const storage = createMediaStorage(useRuntimeConfig())
  let filename: string
  try { filename = await storage.write(`${id}.webp`, bytes, admin ? 'freezer' : 'receipt') }
  catch (error) {
    storage.close()
    throw createError({ statusCode: 503, message: error instanceof MediaStorageConfigurationError ? error.message : 'Upload storage is unavailable. Please try again.' })
  }
  try { await db().media.create({ data: { id, filename, kind: admin ? 'freezer' : 'receipt', orderId, scheduleId } }) }
  catch (error) { await storage.remove(filename).catch(() => {}); throw error }
  finally { storage.close() }
  return { id, url: admin ? `/api/media/${id}` : undefined }
})
