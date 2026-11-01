import { z } from 'zod'
const input = z.object({ open: z.boolean(), capacity: z.number().int().min(1).max(10000), flaskCapacity: z.number().int().min(0).max(10000).optional(), jugCapacity: z.number().int().min(0).max(10000).optional(), reason: z.enum(['MC', 'AL', 'Other']).optional() }).strict()
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
    const used = await tx.order.aggregate({ where: { scheduleId: id, status: { not: 'rejected' }, OR: [{ status: { not: 'pending_payment' } }, { expiresAt: { gt: new Date() } }] }, _sum: { bottles: true } })
    const sizes = { flaskCapacity: parsed.data.flaskCapacity ?? schedule.flaskCapacity, jugCapacity: parsed.data.jugCapacity ?? schedule.jugCapacity }
    const bottleUsage = await dailyBottleUsage(tx, id)
    if (sizes.flaskCapacity < bottleUsage.flask || sizes.jugCapacity < bottleUsage.jug) throw createError({ statusCode: 409, message: 'Daily bottle limits must cover existing reservations.' })
    if (parsed.data.open && parsed.data.capacity < (used._sum.bottles ?? 0)) throw createError({ statusCode: 409, message: 'Capacity must cover existing reservations.' })
    if (!parsed.data.open) await tx.order.updateMany({ where: { scheduleId: id, status: 'pending_payment' }, data: { status: 'rejected' } })
    return tx.schedule.update({ where: { id }, data: { ...sizes, open: parsed.data.open, capacity: parsed.data.capacity, closedReason: parsed.data.open ? null : parsed.data.reason || 'Other', removedAt: null } })
  })
})
