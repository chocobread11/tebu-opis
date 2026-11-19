import { restoreBackup } from './lib/backup'
import { value } from './lib/operations'
const file = process.argv[2]
if (!file || process.argv.length !== 3) throw new Error('Usage: restore.ts /path/to/backup.enc (requires TEBU_RESTORE_DATABASE_URL)')
try { const result = await restoreBackup(file, value('TEBU_RESTORE_DATABASE_URL')); console.log(`Restore verified: database and ${result.media} media files restored.`) }
catch { console.error('Restore failed. Check the key, archive, empty destination database and media destination. Existing databases are never overwritten.'); process.exitCode = 1 }
