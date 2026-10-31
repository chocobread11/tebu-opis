import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import * as schema from '../db/schema'
let connection: ReturnType<typeof drizzle<typeof schema>> | undefined
export function db() {
  const config = useRuntimeConfig()
  if (config.public.demo === true || String(config.public.demo) === 'true') throw createError({ statusCode: 503, message: 'Demo mode uses this device only.' })
  if (!config.databaseUrl) throw createError({ statusCode: 503, message: 'Ordering is not configured yet.' })
  if (!connection) connection = drizzle(postgres(config.databaseUrl, { max: 5, idle_timeout: 20, connect_timeout: 10 }), { schema })
  return connection
}
