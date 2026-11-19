import { createCipheriv, createDecipheriv, randomBytes, randomUUID, createHash } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { appendFile, copyFile, mkdtemp, readFile, rename, rm, stat, writeFile, readdir } from 'node:fs/promises'
import { join, basename } from 'node:path'
import { tmpdir } from 'node:os'
import { pipeline } from 'node:stream/promises'
import pg from 'pg'
import { PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'
import { databaseUrl, mediaStorage, privateDirectory, postgresEnvironment, r2Client, r2Config, run, value } from './operations'

const magic = Buffer.from('TEBUBK01')
const digest = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex')
type Manifest = { version: 1; createdAt: string; databaseHash: string; media: { id: string; filename: string; hash: string }[] }
function encryptionKey() {
  const key = Buffer.from(value('TEBU_BACKUP_ENCRYPTION_KEY'), 'base64')
  if (key.length !== 32) throw new Error('Set TEBU_BACKUP_ENCRYPTION_KEY to a base64-encoded 32-byte key and save it separately from backups.')
  return key
}
export async function createBackup({ offsite = true } = {}) {
  const key = encryptionKey(), directory = await privateDirectory(value('TEBU_BACKUP_DIRECTORY') || './data/backups')
  const work = await mkdtemp(join(tmpdir(), 'tebu-backup-')), source = await privateDirectory(join(work, 'snapshot'))
  const storage = mediaStorage(), sql = new pg.Client({ connectionString: databaseUrl() })
  const name = `tebu-${new Date().toISOString().replaceAll(':', '-')}-${randomUUID()}.backup.enc`, file = join(directory, name), partial = `${file}.partial`
  try {
    await sql.connect(); await sql.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
    const snapshot = (await sql.query('SELECT pg_export_snapshot() AS id')).rows[0].id
    const hasMedia = (await sql.query("SELECT to_regclass('public.media') IS NOT NULL AS present")).rows[0].present
    const rows = (hasMedia ? (await sql.query('SELECT id,filename FROM media ORDER BY id')).rows : []) as { id: string; filename: string }[]
    await run('pg_dump', ['--format=custom', '--no-owner', `--snapshot=${snapshot}`, '--file', join(source, 'database.dump')], postgresEnvironment(databaseUrl()))
    await privateDirectory(join(source, 'media'))
    const media: Manifest['media'] = []
    for (const row of rows) {
      const bytes = await storage.read(row.filename)
      await writeFile(join(source, 'media', `${row.id}.webp`), bytes, { mode: 0o600 })
      media.push({ ...row, hash: digest(bytes) })
    }
    const manifest: Manifest = { version: 1, createdAt: new Date().toISOString(), databaseHash: digest(await readFile(join(source, 'database.dump'))), media }
    await writeFile(join(source, 'manifest.json'), JSON.stringify(manifest), { mode: 0o600 })
    await sql.query('COMMIT')
    const archive = join(work, 'snapshot.tar')
    await run('tar', ['-cf', archive, '-C', source, '.'])
    const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, iv)
    cipher.setAAD(magic)
    await writeFile(partial, Buffer.concat([magic, iv]), { mode: 0o600, flag: 'wx' })
    await pipeline(createReadStream(archive), cipher, createWriteStream(partial, { flags: 'a', mode: 0o600 }))
    await appendFile(partial, cipher.getAuthTag())
    await rename(partial, file)
    if (offsite) {
      const client = r2Client(), r2 = r2Config()
      try {
        const objectKey = `${r2.prefix.replace(/^\/+|\/+$/g, '')}/backups/${name}`
        await client.send(new PutObjectCommand({ Bucket: r2.bucket, Key: objectKey, Body: createReadStream(file), ContentLength: (await stat(file)).size, ContentType: 'application/octet-stream' }))
        const stored = await client.send(new GetObjectCommand({ Bucket: r2.bucket, Key: objectKey }))
        if (!stored.Body || digest(Buffer.from(await stored.Body.transformToByteArray())) !== digest(await readFile(file))) throw new Error('Offsite backup verification failed.')
      } finally { client.destroy() }
    }
    await writeFile(`${file}.verified`, JSON.stringify({ verifiedAt: new Date().toISOString(), offsite }), { mode: 0o600 })
    const keep = Number(value('TEBU_BACKUP_KEEP') || 14)
    if (!Number.isInteger(keep) || keep < 2) throw new Error('TEBU_BACKUP_KEEP must be at least 2.')
    const older = (await readdir(directory)).filter(n => /^tebu-.*\.backup\.enc$/.test(n)).sort().reverse().slice(keep)
    for (const old of older) { await rm(join(directory, old)); await rm(join(directory, `${old}.verified`), { force: true }) }
    return { file, media: rows.length, offsite }
  } finally {
    await sql.end().catch(() => {}); storage.close()
    await rm(work, { recursive: true, force: true }); await rm(partial, { force: true })
  }
}

export async function restoreBackup(file: string, target: string) {
  // Restore only into a separately selected, empty database.
  if (!target) throw new Error('Set TEBU_RESTORE_DATABASE_URL to an empty database.')
  const key = encryptionKey(), bytes = await readFile(file)
  if (!bytes.subarray(0, 8).equals(magic) || bytes.length < 37) throw new Error('Unrecognized backup format.')
  const work = await mkdtemp(join(tmpdir(), 'tebu-restore-')), sql = new pg.Client({ connectionString: target })
  const storage = mediaStorage()
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, bytes.subarray(8, 20)); decipher.setAAD(magic); decipher.setAuthTag(bytes.subarray(-16))
    const plaintext = Buffer.concat([decipher.update(bytes.subarray(20, -16)), decipher.final()])
    const archive = join(work, 'snapshot.tar'); await writeFile(archive, plaintext, { mode: 0o600 })
    const entries = (await run('tar', ['-tf', archive])).trim().split('\n')
    if (entries.some(entry => entry.startsWith('/') || entry.split('/').includes('..'))) throw new Error('Unsafe backup archive.')
    const source = await privateDirectory(join(work, 'snapshot')); await run('tar', ['-xf', archive, '-C', source])
    const manifest: Manifest = JSON.parse(await readFile(join(source, 'manifest.json'), 'utf8'))
    if (manifest.version !== 1 || digest(await readFile(join(source, 'database.dump'))) !== manifest.databaseHash) throw new Error('Backup database checksum failed.')
    await sql.connect()
    if (Number((await sql.query("SELECT count(*) FROM pg_tables WHERE schemaname NOT IN ('pg_catalog','information_schema')")).rows[0].count)) throw new Error('Restore destination must be empty. Existing databases are never overwritten.')
    const client = r2Client(), r2 = r2Config()
    try {
      for (const row of manifest.media) {
        if (!/^[0-9a-f-]{36}$/.test(row.id)) throw new Error('Invalid backup media ID.')
        const content = await readFile(join(source, 'media', `${row.id}.webp`))
        if (digest(content) !== row.hash) throw new Error('Backup image checksum failed.')
        let existing: Buffer | undefined
        try { existing = await storage.read(row.filename) }
        catch (error: any) { if (error.code !== 'ENOENT' && error.name !== 'NoSuchKey' && error.$metadata?.httpStatusCode !== 404) throw error }
        if (existing) { if (digest(existing) !== row.hash) throw new Error('An existing image differs from this backup. Restore into a separate media destination.'); continue }
        if (row.filename.startsWith('r2:')) {
          await client.send(new PutObjectCommand({ Bucket: r2.bucket, Key: row.filename.slice(3), Body: content, ContentType: 'image/webp', IfNoneMatch: '*' }))
        } else {
          if (basename(row.filename) !== row.filename || !/^[\w-]+\.webp$/.test(row.filename)) throw new Error('Unsafe local media filename.')
          const directory = await privateDirectory(value('NUXT_UPLOAD_DIR') || './data/uploads')
          await copyFile(join(source, 'media', `${row.id}.webp`), join(directory, row.filename), 1)
        }
      }
    } finally { client.destroy() }
    await run('pg_restore', ['--dbname', postgresEnvironment(target).PGDATABASE, '--exit-on-error', '--single-transaction', '--no-owner', '--no-privileges', join(source, 'database.dump')], postgresEnvironment(target))
    return { media: manifest.media.length }
  } finally { await sql.end().catch(() => {}); storage.close(); await rm(work, { recursive: true, force: true }) }
}
