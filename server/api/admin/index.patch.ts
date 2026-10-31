import { z } from 'zod'
import { and, eq } from 'drizzle-orm'
import { orders, schedules, media } from '../../db/schema'
const input = z.discriminatedUnion('action', [
  z.object({ action: z.enum(['approve', 'reject', 'pack', 'notify']), orderToken: z.string() }),
  z.object({ action: z.literal('drop'), scheduleId: z.string(), photoId: z.uuid() }),
])
export default defineEventHandler(async event => {
  requireAdmin(event)
  const parsed = input.safeParse(await readBody(event)); if (!parsed.success) throw createError({ statusCode: 400, message: 'Invalid operation.' })
  const data = parsed.data
  if (data.action === 'drop') {
    await db().transaction(async tx => {
      const [schedule] = await tx.select().from(schedules).where(eq(schedules.id, data.scheduleId)).for('update')
      if (!schedule) throw createError({ statusCode: 404, message: 'Drop not found.' })
      const [photo] = await tx.select().from(media).where(and(eq(media.id, data.photoId), eq(media.scheduleId, schedule.id), eq(media.kind, 'freezer')))
      if (!photo) throw createError({ statusCode: 400, message: 'Upload the freezer photo for this drop first.' })
      const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kuala_Lumpur', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
      if (schedule.id > today) throw createError({ statusCode: 409, message: 'The pantry drop can only be published on or after its scheduled day.' })
      await tx.update(schedules).set({ photoId: photo.id, droppedAt: new Date(), open: false }).where(eq(schedules.id, schedule.id))
      await tx.update(orders).set({ status: 'ready' }).where(and(eq(orders.scheduleId, schedule.id), eq(orders.status, 'confirmed'), eq(orders.packed, true)))
    })
    return { ok: true }
  }
  const order = await findOrder(data.orderToken)
  const allowed = { approve: 'pending_review', reject: 'pending_review', pack: 'confirmed', notify: 'ready' } as const
  const expected = allowed[data.action]
  const changes = data.action === 'approve' ? { status: 'confirmed' as const } : data.action === 'reject' ? { status: 'rejected' as const } : data.action === 'pack' ? { packed: !order.packed } : { notified: true }
  const [updated] = await db().update(orders).set(changes).where(and(eq(orders.id, order.id), eq(orders.status, expected))).returning()
  if (!updated) throw createError({ statusCode: 409, message: 'The order status changed. Refresh and try again.' })
  return { ok: true }
})
