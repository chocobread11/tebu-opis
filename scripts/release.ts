import { createBackup } from './lib/backup'
import { databaseUrl, run } from './lib/operations'
databaseUrl()
try {
  await run(process.execPath, ['--import', 'tsx', 'scripts/check-production.ts'])
  await createBackup()
  console.log('Pre-migration backup verified.')
  await run(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy'])
  console.log('Database migrations applied.')
  await run(process.execPath, ['--import', 'tsx', 'scripts/seed.ts', '--schedules-only'], { ...process.env, NODE_ENV: 'production' })
  console.log('Production schedules initialized; existing orders and products preserved.')
} catch { console.error('Release stopped. Check the backup configuration and database access. The app must not start until this step succeeds.'); process.exitCode = 1 }
