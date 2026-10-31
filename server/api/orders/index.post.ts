import { z } from 'zod'
import { and, eq, ne, or, gt, sql } from 'drizzle-orm'
import { orders, schedules } from '../../db/schema'
import { total, bottleCount, nextDrops } from '../../../shared/domain'
const qty = z.number().int().min(0).max(10)
const input = z.object({ scheduleId: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), requestId: z.uuid(), cart: z.object({ flask: qty, jug: qty, asam: qty, limau: qty }).strict() }).strict()
export default defineEventHandler(async event => {
  const customer = await requireCustomer(event)
  const parsed = input.safeParse(await readBody(event)); if (!parsed.success || !bottleCount(parsed.data.cart)) throw createError({ statusCode: 400, message: 'Add at least one bottle. Maximum 10 of each item.' })
  const data = parsed.data
  if (!useRuntimeConfig().public.duitnowQr) throw createError({ statusCode: 503, message: 'Payment QR has not been configured.' })
  if (!nextDrops().some(d => d.id === data.scheduleId)) throw createError({ statusCode: 400, message: 'Choose an upcoming drop.' })
  const order = await db().transaction(async tx => {
    const [schedule] = await tx.select().from(schedules).where(eq(schedules.id, data.scheduleId)).for('update')
    if (!schedule?.open || schedule.droppedAt) throw createError({ statusCode: 409, message: 'This drop is closed.' })
    const [existing] = await tx.select().from(orders).where(eq(orders.requestId, data.requestId))
    if (existing) { if (existing.customerId !== customer.id) throw createError({ statusCode: 409, message: 'Please restart checkout.' }); return existing }
    const [usage] = await tx.select({ used: sql<number>`coalesce(sum(${orders.bottles}),0)::int` }).from(orders).where(and(eq(orders.scheduleId, data.scheduleId), ne(orders.status, 'rejected'), or(ne(orders.status, 'pending_payment'), gt(orders.expiresAt, new Date()))))
    if (Number(usage!.used) + bottleCount(data.cart) > schedule.capacity) throw createError({ statusCode: 409, message: 'This drop has filled up. Choose another day or fewer bottles.' })
    const [last] = await tx.select({ max: sql<number>`coalesce(max(${orders.sequence}),0)::int` }).from(orders).where(eq(orders.scheduleId, data.scheduleId))
    const sequence = Number(last!.max) + 1
    const [created] = await tx.insert(orders).values({ token: newToken(), requestId: data.requestId, customerId: customer.id, scheduleId: data.scheduleId, sequence, tag: `#A${String(sequence).padStart(2, '0')}`, cart: data.cart, bottles: bottleCount(data.cart), total: total(data.cart), expiresAt: new Date(Date.now() + 20 * 60000) }).returning()
    return created!
  })
  return toTicket(order)
})
