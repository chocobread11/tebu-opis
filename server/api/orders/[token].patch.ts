import { z } from 'zod'
import { and, eq, gt } from 'drizzle-orm'
import { orders, media } from '../../db/schema'
const input = z.discriminatedUnion('action', [z.object({ action: z.literal('collect') }), z.object({ action: z.literal('receipt'), receiptId: z.uuid() })])
export default defineEventHandler(async event => {
  const order = await findOrder(getRouterParam(event, 'token') || '')
  const data = input.safeParse(await readBody(event)); if (!data.success) throw createError({ statusCode: 400, message: 'Invalid ticket update.' })
  if (data.data.action === 'collect') {
    if (order.status === 'collected') return toTicket(order)
    const [updated] = await db().update(orders).set({ status: 'collected' }).where(and(eq(orders.id, order.id), eq(orders.status, 'ready'))).returning()
    if (!updated) throw createError({ statusCode: 409, message: 'Your bottle is not ready for pickup yet.' })
    return toTicket(updated)
  }
  const customer = await requireCustomer(event)
  if (order.customerId !== customer.id) throw createError({ statusCode: 403, message: 'This receipt belongs to another customer.' })
  const [receipt] = await db().select().from(media).where(and(eq(media.id, data.data.receiptId), eq(media.orderId, order.id), eq(media.kind, 'receipt')))
  if (!receipt) throw createError({ statusCode: 400, message: 'Upload your receipt first.' })
  const [updated] = await db().update(orders).set({ receiptId: receipt.id, status: 'pending_review' }).where(and(eq(orders.id, order.id), eq(orders.status, 'pending_payment'), gt(orders.expiresAt, new Date()))).returning()
  if (!updated) { if (order.receiptId === receipt.id) return toTicket(order); throw createError({ statusCode: 409, message: 'The reservation has expired or already been submitted. Contact the operator if you have paid.' }) }
  return toTicket(updated)
})
