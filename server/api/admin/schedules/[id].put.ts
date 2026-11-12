import { z } from 'zod'
import { bottleSpaces } from '../../../../shared/domain'
const input = z.object({ open: z.boolean(), capacity: z.number().int().min(1).max(10000), reason: z.enum(['MC', 'AL', 'Other']).optional() }).strict()
export default defineEventHandler(async event => {
  requireAdmin(event)
  const id = getRouterParam(event, 'id') || ''
  requireFutureDate(id)
  const parsed = input.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, message: 'Enter a valid capacity and day status.' })
  return db().$transaction(async tx => {
    // Upsert creates a lockable exclusion even when this date was never scheduled.
    await tx.schedule.upsert({ where: { id }, update: {}, create: { id, open: false } })
    await tx.$queryRaw`SELECT id FROM schedules WHERE id = ${id} FOR UPDATE`
    const schedule = await tx.schedule.findUniqueOrThrow({ where: { id } })
    if (schedule.droppedAt) throw createError({ statusCode: 409, message: 'This drop has already been delivered.' })
    const bottleUsage = await dailyBottleUsage(tx, id)
    if (parsed.data.capacity < bottleSpaces(bottleUsage)) throw createError({ statusCode: 409, message: 'Box capacity must cover existing reservations.' })
    if (!parsed.data.open) await tx.order.updateMany({ where: { scheduleId: id, status: 'pending_payment' }, data: { status: 'rejected' } })
    return tx.schedule.update({ where: { id }, data: { kecikCapacity: parsed.data.capacity, besarCapacity: Math.floor(parsed.data.capacity / 2), open: parsed.data.open, capacity: parsed.data.capacity, closedReason: parsed.data.open ? null : parsed.data.reason || 'Other', removedAt: null } })
  })
})
