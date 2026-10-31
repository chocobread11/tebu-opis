import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import { schedules } from '../server/db/schema'
import { nextDrops } from '../shared/domain'
if (!process.env.NUXT_DATABASE_URL) throw new Error('Set NUXT_DATABASE_URL first.')
const client = postgres(process.env.NUXT_DATABASE_URL, { max: 1 })
try {
  const database = drizzle(client)
  // Safe to rerun: preserve capacity, photos and open/closed state on existing dates.
  await database.insert(schedules).values(nextDrops().map(d => ({ id: d.id, capacity: 30 }))).onConflictDoNothing()
  console.log('Upcoming Mon–Thu drops prepared. Run weekly to extend the schedule.')
} finally { await client.end() }
