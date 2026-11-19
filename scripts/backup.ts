import { createBackup } from './lib/backup'
import { setTimeout as delay } from 'node:timers/promises'
import { value } from './lib/operations'
const args = process.argv.slice(2)
if (args.some(arg => !['--schedule', '--local-only'].includes(arg))) throw new Error('Usage: backup.ts [--schedule] [--local-only]')
const scheduled = args.includes('--schedule'), seconds = Number(value('TEBU_BACKUP_INTERVAL_SECONDS') || 86400)
if (!Number.isFinite(seconds) || seconds < 60) throw new Error('Backup interval must be at least 60 seconds.')
do {
  try { const result = await createBackup({ offsite: !args.includes('--local-only') }); console.log(`Backup verified: ${result.media} media files, encrypted archive${result.offsite ? ' and R2 copy' : ''}.`) }
  catch { console.error('Backup failed. Check database/storage access, free disk space and the backup encryption key.'); if (!scheduled) process.exitCode = 1 }
  if (scheduled) await delay(seconds * 1000)
} while (scheduled)
