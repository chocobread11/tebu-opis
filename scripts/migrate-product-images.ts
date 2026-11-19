import 'dotenv/config'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createDatabase } from '../server/db/client'
import { createMediaStorage } from '../server/storage/media'
import { prepareUploadedImage } from '../server/utils/upload-image'
import { storefrontImages } from '../lib/storefront-images'

const apply = process.argv.includes('--apply')
if (process.argv.slice(2).some(arg => arg !== '--apply')) throw new Error('Usage: npm run storage:products [-- --apply]')
if (!process.env.NUXT_DATABASE_URL) throw new Error('Set NUXT_DATABASE_URL first.')
const value = (key: string) => process.env[key]?.trim() || ''
const database = createDatabase(process.env.NUXT_DATABASE_URL)
const storage = createMediaStorage({ uploadDir: value('NUXT_UPLOAD_DIR') || './data/uploads', uploadStorage: 'r2', r2: {
  accountId: value('NUXT_R2_ACCOUNT_ID'), endpoint: value('NUXT_R2_ENDPOINT'), accessKeyId: value('NUXT_R2_ACCESS_KEY_ID'), secretAccessKey: value('NUXT_R2_SECRET_ACCESS_KEY'), bucket: value('NUXT_R2_BUCKET'), prefix: value('NUXT_R2_PREFIX') || 'tebu/media',
} })
let moved = 0, verified = 0
try {
  for (const { id: productId } of await database.product.findMany({ select: { id: true }, orderBy: { sortOrder: 'asc' } })) {
    // Re-read each image so products sharing a media record only migrate it once.
    const product = await database.product.findUniqueOrThrow({ where: { id: productId }, include: { image: true } })
    if (product.image?.filename.startsWith('r2:')) {
      if (apply) assert.ok((await storage.read(product.image.filename)).length)
      verified++; console.log(`${product.name}: ${apply ? 'verified in R2' : 'already in R2'}`); continue
    }
    const fallback = (storefrontImages as Record<string, string>)[product.id]
    if (!product.image && !fallback) { console.log(`${product.name}: no current image to move`); continue }
    if (!apply) { console.log(`${product.name}: ready to copy to R2`); moved++; continue }
    const source = product.image ? await storage.read(product.image.filename) : await readFile(resolve('public', fallback!.slice(1)))
    const bytes = await prepareUploadedImage(source)
    const imageId = product.image?.id || randomUUID()
    const stored = await storage.write(`${randomUUID()}.webp`, bytes, 'product')
    try {
      assert.deepEqual(await storage.read(stored), bytes, 'Uploaded image did not match the source.')
      await database.$transaction(async tx => {
        await tx.$queryRaw`SELECT id FROM products WHERE id=${productId} FOR UPDATE`
        const current = await tx.product.findUniqueOrThrow({ where: { id: productId } })
        if (current.imageId !== product.imageId) throw new Error('Product image changed during the copy. Retry the migration.')
        if (product.image) {
          const updated = await tx.media.updateMany({ where: { id: imageId, filename: product.image.filename }, data: { filename: stored } })
          if (updated.count !== 1) throw new Error('Media changed during the copy. Retry the migration.')
        } else {
          await tx.media.create({ data: { id: imageId, filename: stored, kind: 'product', productId } })
          await tx.product.update({ where: { id: productId }, data: { imageId } })
        }
      })
    } catch (error) { await storage.remove(stored).catch(() => {}); throw error }
    moved++; console.log(`${product.name}: copied, verified and linked to R2`)
  }
  console.log(`${apply ? 'Migrated' : 'Would migrate'} ${moved} images; ${verified} already in R2. Original local images are preserved.`)
} catch (error: any) {
  // Storage errors can include signed request details; never print credentials.
  console.error(`Product image migration failed: ${error.name || 'Error'}${error.$metadata?.httpStatusCode ? ` (HTTP ${error.$metadata.httpStatusCode})` : ''}`)
  process.exitCode = 1
} finally { storage.close(); await database.$disconnect() }
