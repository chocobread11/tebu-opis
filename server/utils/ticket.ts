import { eq } from 'drizzle-orm'
import { customers, schedules, type orders } from '../db/schema'
export async function toTicket(order: typeof orders.$inferSelect, admin = false) {
  const [customer] = await db().select().from(customers).where(eq(customers.id, order.customerId)).limit(1)
  const [schedule] = await db().select().from(schedules).where(eq(schedules.id, order.scheduleId)).limit(1)
  return { token: order.token, tag: order.tag, name: customer!.name, phone: admin ? customer!.phone : '', scheduleId: order.scheduleId, cart: order.cart, total: order.total, status: order.status, packed: order.packed, notified: order.notified, createdAt: order.createdAt.toISOString(), expiresAt: order.expiresAt.toISOString(), receiptId: admin ? order.receiptId : undefined, photoUrl: schedule?.photoId ? `/api/media/${schedule.photoId}` : undefined }
}
