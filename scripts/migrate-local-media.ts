import 'dotenv/config'
import assert from 'node:assert/strict'
import { randomUUID, createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { createDatabase } from '../server/db/client'
import { databaseUrl, mediaStorage } from './lib/operations'
import type { MediaKind } from '../server/storage/media'

if (process.argv.slice(2).some(arg => arg !== '--apply')) throw new Error('Usage: migrate-local-media.ts [--apply]')
const apply = process.argv.includes('--apply'), database = createDatabase(databaseUrl()), storage = mediaStorage()
const journal: { ids: string[]; from: string; to: string; sha256: string }[] = []
const journalFile = `data/local-media-migration-${new Date().toISOString().replaceAll(':', '-')}.json`
try {
  const rows = await database.media.findMany({ where: { NOT: { filename: { startsWith: 'r2:' } } }, select: { id: true, filename: true, kind: true } })
  const grouped = new Map<string, typeof rows>()
  for (const row of rows) { const key = `${row.kind}:${row.filename}`; grouped.set(key, [...grouped.get(key) || [], row]) }
  for (const group of grouped.values()) {
    const row = group[0]!, bytes = await storage.read(row.filename)
    if (!['receipt', 'freezer', 'product'].includes(row.kind)) throw new Error('Unrecognized media kind.')
    if (!apply) continue
    const stored = await storage.write(`${randomUUID()}.webp`, bytes, row.kind as MediaKind)
    assert.deepEqual(await storage.read(stored), bytes, 'R2 copy verification failed.')
    const ids = group.map(item => item.id)
    const entry = { ids, from: row.filename, to: stored, sha256: createHash('sha256').update(bytes).digest('hex') }
    // Persist recovery information before changing references. Local originals stay intact.
    journal.push(entry); await mkdir('data', { recursive: true, mode: 0o700 }); await writeFile(journalFile, JSON.stringify(journal, null, 2), { mode: 0o600 })
    await database.media.updateMany({ where: { id: { in: ids }, filename: row.filename }, data: { filename: stored } })
  }
  console.log(`${apply ? 'Migrated and verified' : 'Ready to migrate'} ${rows.length} media records (${grouped.size} distinct images). Media IDs and URLs are preserved; local originals are retained.`)
} catch { console.error('Media migration stopped. Check storage/database access and the migration journal; local originals remain available.'); process.exitCode = 1 }
finally { storage.close(); await database.$disconnect() }
