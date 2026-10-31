import { desc, gte } from 'drizzle-orm'
import { orders } from '../../db/schema'
export default defineEventHandler(async event => {
  requireAdmin(event)
  const rows = await db().select().from(orders).where(gte(orders.createdAt, new Date(Date.now() - 45 * 86400000))).orderBy(desc(orders.createdAt)).limit(1000)
  return { orders: await Promise.all(rows.map(o => toTicket(o, true))) }
})
