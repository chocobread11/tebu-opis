import { readdir, stat, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { value } from './lib/operations'
try {
  const directory = value('TEBU_BACKUP_DIRECTORY') || './data/backups'
  const files = (await readdir(directory)).filter(name => name.endsWith('.backup.enc.verified')).sort()
  const latest = files.at(-1)
  if (!latest) throw new Error()
  if (!JSON.parse(await readFile(join(directory, latest), 'utf8')).offsite) throw new Error()
  await stat(join(directory, latest.slice(0, -'.verified'.length)))
  const seconds = Number(value('TEBU_BACKUP_INTERVAL_SECONDS') || 86400)
  if (Date.now() - (await stat(join(directory, latest))).mtimeMs > seconds * 2000) throw new Error()
} catch { console.error('No recent completed backup.'); process.exitCode = 1 }
