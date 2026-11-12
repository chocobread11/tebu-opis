import 'dotenv/config'
import assert from 'node:assert/strict'
import { basename } from 'node:path'
import { mkdir, writeFile } from 'node:fs/promises'
import { createDatabase } from '../server/db/client'
import { createMediaStorage, mediaObjectKey, type MediaKind } from '../server/storage/media'

const args = process.argv.slice(2)
if (args.some(arg => arg !== '--apply')) throw new Error('Usage: npm run storage:organize [-- --apply]')
if (!process.env.NUXT_DATABASE_URL) throw new Error('Set NUXT_DATABASE_URL first.')
const apply = args.includes('--apply')
const database = createDatabase(process.env.NUXT_DATABASE_URL)
const r2 = {
  accountId: process.env.NUXT_R2_ACCOUNT_ID?.trim() || '', endpoint: process.env.NUXT_R2_ENDPOINT?.trim() || '',
  accessKeyId: process.env.NUXT_R2_ACCESS_KEY_ID?.trim() || '', secretAccessKey: process.env.NUXT_R2_SECRET_ACCESS_KEY?.trim() || '',
  bucket: process.env.NUXT_R2_BUCKET?.trim() || '', prefix: process.env.NUXT_R2_PREFIX?.trim() ?? 'tebu/media',
}
const storage = createMediaStorage({ uploadDir: process.env.NUXT_UPLOAD_DIR || './data/uploads', uploadStorage: 'r2', r2 })
const journal: { id: string; from: string; to: string; oldObjectRemoved: boolean }[] = []
const path = `data/r2-folder-move-${new Date().toISOString().replaceAll(':', '-')}.json`
async function saveJournal() { await mkdir('data', { recursive: true, mode: 0o700 }); await writeFile(path, JSON.stringify(journal, null, 2), { mode: 0o600 }) }
try {
  const rows = await database.media.findMany({ where: { filename: { startsWith: 'r2:' }, kind: { in: ['receipt', 'freezer'] } }, select: { id: true, filename: true, kind: true } })
  let moved = 0
  for (const row of rows) {
    const filename = basename(row.filename.slice(3))
    const destination = `r2:${mediaObjectKey(r2.prefix, filename, row.kind as MediaKind)}`
    if (destination === row.filename) continue
    if (!apply) { console.log(`${row.kind}: ${row.filename} → ${destination}`); moved++; continue }
    // Keep the old object until the copied bytes are verified and the DB points to them.
    const bytes = await storage.read(row.filename)
    const stored = await storage.write(filename, bytes, row.kind as MediaKind)
    assert.equal(stored, destination)
    assert.deepEqual(await storage.read(stored), bytes)
    const updated = await database.media.updateMany({ where: { id: row.id, filename: row.filename }, data: { filename: stored } })
    if (!updated.count) throw new Error('A media record changed during the move; retry after checking the journal.')
    const entry = { id: row.id, from: row.filename, to: stored, oldObjectRemoved: false }
    journal.push(entry); await saveJournal()
    if (!await database.media.count({ where: { filename: row.filename } })) { await storage.remove(row.filename); entry.oldObjectRemoved = true; await saveJournal() }
    moved++
  }
  console.log(apply ? `Moved and verified ${moved} R2 images. Existing media URLs are unchanged.` : `${moved} R2 images would move. Run with --apply to organize them.`)
  if (journal.length) console.log(`Move journal: ${path}`)
} finally { storage.close(); await database.$disconnect() }
