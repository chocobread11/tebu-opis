import { createDatabase } from '../db/client'
let connection: ReturnType<typeof createDatabase> | undefined
export function db() {
  const config = useRuntimeConfig()
  if (config.public.demo === true || String(config.public.demo) === 'true') throw createError({ statusCode: 503, message: 'Demo mode uses this device only.' })
  if (!config.databaseUrl) throw createError({ statusCode: 503, message: 'Ordering is not configured yet.' })
  if (!connection) connection = createDatabase(config.databaseUrl)
  return connection
}
