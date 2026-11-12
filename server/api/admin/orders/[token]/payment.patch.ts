import { z } from 'zod'
import { paymentStatuses, paymentStatus, paymentOptions, paymentChanges } from '../../../../../shared/payment'
const input = z.object({ paymentStatus: z.enum(paymentStatuses), expectedStatus: z.string(), expectedPaymentStatus: z.enum(paymentStatuses) }).strict()

export default defineEventHandler(async event => {
  requireAdmin(event)
  const parsed = input.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, message: 'Choose a valid payment status.' })
  const initial = await findOrder(getRouterParam(event, 'token') || '')
  const data = parsed.data
  const updated = await db().$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM schedules WHERE id = ${initial.scheduleId} FOR UPDATE`
    if (initial.varietyId) await lockVarieties(tx, [initial.varietyId])
    await tx.$queryRaw`SELECT id FROM orders WHERE id = ${initial.id}::uuid FOR UPDATE`
    const current = await tx.order.findUnique({ where: { id: initial.id } })
    if (!current || current.scheduleId !== initial.scheduleId || current.varietyId !== initial.varietyId || current.status !== data.expectedStatus || paymentStatus(current) !== data.expectedPaymentStatus) {
      throw createError({ statusCode: 409, message: 'This transaction changed. Refresh it before changing payment.' })
    }
    if (!paymentOptions(current).includes(data.paymentStatus)) throw createError({ statusCode: 400, message: 'This payment status is not available for this order.' })
    const { expiresAt, ...changes } = paymentChanges(current, data.paymentStatus)
    const order = await tx.order.update({ where: { id: current.id }, data: { ...changes, ...(expiresAt ? { expiresAt: new Date(expiresAt) } : {}) } })
    const schedule = await tx.schedule.findUniqueOrThrow({ where: { id: order.scheduleId } })
    await ensureDailyCapacity(tx, schedule, { kecik: 0, besar: 0 })
    if (order.varietyId) await ensureStockNotOversold(tx, [order.varietyId])
    return order
  })
  return { order: await toTicket(updated, true) }
})
