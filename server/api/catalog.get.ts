import { and, eq, sql, desc, ne, or, gt } from 'drizzle-orm'
import { schedules, orders, customers } from '../db/schema'
import { nextDrops } from '../../shared/domain'
export default defineEventHandler(async () => {
  const dates = nextDrops()
  const rows = await db().select().from(schedules).where(eq(schedules.open, true))
  const drops = []
  for (const row of rows.filter(r => dates.some(d => d.id === r.id))) {
    const [count] = await db().select({ used: sql<number>`coalesce(sum(${orders.bottles}),0)::int` }).from(orders).where(and(eq(orders.scheduleId, row.id), ne(orders.status, 'rejected'), or(ne(orders.status, 'pending_payment'), gt(orders.expiresAt, new Date()))))
    drops.push({ ...dates.find(d => d.id === row.id)!, capacity: row.capacity, remaining: Math.max(0, row.capacity - Number(count!.used)) })
  }
  const queue = await db().select({ tag: orders.tag, name: customers.name }).from(orders).innerJoin(customers, eq(customers.id, orders.customerId)).where(and(eq(orders.scheduleId, drops[0]?.id || ''), ne(orders.status, 'pending_payment'), ne(orders.status, 'rejected'))).orderBy(desc(orders.createdAt)).limit(6)
  return { drops: drops.sort((a, b) => a.id.localeCompare(b.id)), queue: queue.map(q => ({ tag: q.tag, name: q.name.split(' ')[0] })) }
})
