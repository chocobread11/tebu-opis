import { createMediaStorage, MediaStorageConfigurationError } from '../storage/media'
import { randomUUID } from 'node:crypto'
import sharp from 'sharp'
export default defineEventHandler(async event => {
  const admin = isAdmin(event)
  const customer = admin ? null : await requireCustomer(event)
  const parts = await readMultipartFormData(event)
  const file = parts?.find(p => p.name === 'file')
  if (!file || file.type !== 'image/webp' || file.data.length >= (admin ? 250000 : 80000)) throw createError({ statusCode: 400, message: 'Upload a compressed WebP image within the size limit.' })
  let orderId: string | undefined
  let scheduleId: string | undefined
  if (admin) {
    scheduleId = parts?.find(p => p.name === 'scheduleId')?.data.toString()
    if (!scheduleId || !/^\d{4}-\d{2}-\d{2}$/.test(scheduleId)) throw createError({ statusCode: 400, message: 'Select a valid drop day.' })
    const schedule = await db().schedule.findUnique({ where: { id: scheduleId } })
    if (!schedule) throw createError({ statusCode: 404, message: 'Drop not found.' })
  } else {
    const order = await findOrder(parts?.find(p => p.name === 'orderToken')?.data.toString() || '')
    if (order.customerId !== customer!.id || order.status !== 'pending_payment' || order.expiresAt < new Date()) throw createError({ statusCode: 403, message: 'This order is not accepting receipts. Contact the operator if you have paid.' })
    orderId = order.id
  }
  let bytes: Buffer
  try { bytes = await sharp(file.data, { limitInputPixels: 12_000_000 }).rotate().webp({ quality: 85 }).toBuffer(); if (bytes.length >= (admin ? 250000 : 80000)) throw new Error('size') }
  catch { throw createError({ statusCode: 400, message: 'Image verification failed. Try a smaller screenshot.' }) }
  const id = randomUUID()
  const storage = createMediaStorage(useRuntimeConfig())
  let filename: string
  try { filename = await storage.write(`${id}.webp`, bytes) }
  catch (error) {
    storage.close()
    throw createError({ statusCode: 503, message: error instanceof MediaStorageConfigurationError ? error.message : 'Upload storage is unavailable. Please try again.' })
  }
  try { await db().media.create({ data: { id, filename, kind: admin ? 'freezer' : 'receipt', orderId, scheduleId } }) }
  catch (error) { await storage.remove(filename).catch(() => {}); throw error }
  finally { storage.close() }
  return { id, url: admin ? `/api/media/${id}` : undefined }
})
