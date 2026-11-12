import 'dotenv/config'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { tmpdir } from 'node:os'
import sharp from 'sharp'
import { createMediaStorage } from '../server/storage/media'

const value = (key: string) => process.env[key]?.trim() || ''
const r2 = {
  accountId: value('NUXT_R2_ACCOUNT_ID'),
  endpoint: value('NUXT_R2_ENDPOINT'),
  accessKeyId: value('NUXT_R2_ACCESS_KEY_ID'),
  secretAccessKey: value('NUXT_R2_SECRET_ACCESS_KEY'),
  bucket: value('NUXT_R2_BUCKET'),
  prefix: process.env.NUXT_R2_PREFIX?.trim() ?? 'tebu/media',
}
const missing = [
  ...(!r2.accountId && !r2.endpoint ? ['NUXT_R2_ACCOUNT_ID (or NUXT_R2_ENDPOINT)'] : []),
  ...(!r2.accessKeyId ? ['NUXT_R2_ACCESS_KEY_ID'] : []),
  ...(!r2.secretAccessKey ? ['NUXT_R2_SECRET_ACCESS_KEY'] : []),
  ...(!r2.bucket ? ['NUXT_R2_BUCKET'] : []),
]
if (missing.length) {
  console.error(`Save these settings in .env first: ${missing.join(', ')}`)
  process.exitCode = 1
} else {
  const storage = createMediaStorage({ uploadDir: tmpdir(), uploadStorage: 'r2', r2 })
  let filename: string | undefined
  try {
    const bytes = await sharp({ create: { width: 2, height: 2, channels: 3, background: '#abc864' } }).webp().toBuffer()
    for (const kind of ['receipt', 'freezer'] as const) {
      filename = await storage.write(`connection-check-${randomUUID()}.webp`, bytes, kind)
      assert.deepEqual(await storage.read(filename), bytes, 'R2 returned different image bytes.')
      await storage.remove(filename)
      const removed = filename
      filename = undefined
      await assert.rejects(storage.read(removed), { name: 'NoSuchKey' })
    }
    console.log('PASS: receipt and drop folders each support image upload, byte-for-byte read, and deletion.')
  } catch (error: any) {
    // Do not print request details or credentials when authentication fails.
    console.error(`R2 check failed: ${error.name || 'Error'}${error.$metadata?.httpStatusCode ? ` (HTTP ${error.$metadata.httpStatusCode})` : ''}`)
    process.exitCode = 1
  } finally {
    if (filename) {
      try { await storage.remove(filename) }
      catch { console.error('Temporary R2 image cleanup failed; check the bucket for connection-check images.'); process.exitCode = 1 }
    }
    storage.close()
  }
}
