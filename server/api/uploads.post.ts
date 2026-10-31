import { mkdir, writeFile, unlink } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import sharp from 'sharp'
import { eq } from 'drizzle-orm'
import { media, schedules } from '../db/schema'
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
    const [schedule] = await db().select().from(schedules).where(eq(schedules.id, scheduleId))
    if (!schedule) throw createError({ statusCode: 404, message: 'Drop not found.' })
  } else {
    const order = await findOrder(parts?.find(p => p.name === 'orderToken')?.data.toString() || '')
    if (order.customerId !== customer!.id || order.status !== 'pending_payment' || order.expiresAt < new Date()) throw createError({ statusCode: 403, message: 'This order is not accepting receipts. Contact the operator if you have paid.' })
    orderId = order.id
  }
  let bytes: Buffer
  try { bytes = await sharp(file.data, { limitInputPixels: 12_000_000 }).rotate().webp({ quality: 85 }).toBuffer(); if (bytes.length >= (admin ? 250000 : 80000)) throw new Error('size') }
  catch { throw createError({ statusCode: 400, message: 'Image verification failed. Try a smaller screenshot.' }) }
  const id = randomUUID(); const filename = `${id}.webp`
  const directory = resolve(useRuntimeConfig().uploadDir)
  await mkdir(directory, { recursive: true, mode: 0o700 }); await writeFile(join(directory, filename), bytes, { mode: 0o600, flag: 'wx' })
  try { await db().insert(media).values({ id, filename, kind: admin ? 'freezer' : 'receipt', orderId, scheduleId }) } catch (error) { await unlink(join(directory, filename)); throw error }
  return { id, url: admin ? `/api/media/${id}` : undefined }
})
