import 'dotenv/config'
import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import sharp from 'sharp'
import { createDatabase } from '../server/db/client'
import { nextDrops, bottleCount, total, products, defaultMonthSchedules } from '../shared/domain'
import { sampleCustomers, sampleOrders, sampleId, sampleToken } from './seed-data'

const args = process.argv.slice(2)
if (args.some(arg => arg !== '--schedules-only')) throw new Error('Usage: npm run db:seed [-- --schedules-only]')
const schedulesOnly = args.includes('--schedules-only')
if (!schedulesOnly && process.env.NODE_ENV === 'production') throw new Error('Sample data is for development. Use npm run db:seed:schedules in production.')
if (!process.env.NUXT_DATABASE_URL) throw new Error('Set NUXT_DATABASE_URL in .env first.')
const database = createDatabase(process.env.NUXT_DATABASE_URL)
const now = new Date()
const drops = nextDrops(now)

async function sampleImage(kind: 'receipt' | 'freezer') {
  const filename = `sample-${kind}.webp`
  const directory = resolve(process.env.NUXT_UPLOAD_DIR || './data/uploads')
  const image = await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400"><rect width="640" height="400" fill="#e5eed8"/><text x="40" y="160" font-family="sans-serif" font-size="32" fill="#245238">SAMPLE ${kind.toUpperCase()}</text><text x="40" y="220" font-family="sans-serif" font-size="22" fill="#245238">Development fixture - no real payment</text></svg>`)).webp().toBuffer()
  await mkdir(directory, { recursive: true, mode: 0o700 })
  try { await writeFile(join(directory, filename), image, { flag: 'wx', mode: 0o600 }) }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error }
  return filename
}

try {
  for (const [sortOrder, product] of products.entries()) {
    await database.product.upsert({ where: { id: product.id }, update: {}, create: { ...product, sortOrder } })
  }
  for (const [sortOrder, id] of ['tebu-1', 'tebu-2'].entries()) await database.caneVariety.upsert({ where: { id }, update: {}, create: { id, name: `Tebu ${sortOrder + 1}`, sortOrder } })
  if (!schedulesOnly) {
    const receiptFilename = await sampleImage('receipt')
    const freezerFilename = await sampleImage('freezer')
    const past = new Date(`${new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kuala_Lumpur', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)}T00:00:00Z`)
    do { past.setUTCDate(past.getUTCDate() - 1) } while (past.getUTCDay() < 1 || past.getUTCDay() > 4)
    const pastId = past.toISOString().slice(0, 10)
    await database.$transaction(async tx => {
      await tx.schedule.createMany({ data: defaultMonthSchedules(now), skipDuplicates: true })
      await tx.schedule.upsert({ where: { id: pastId }, update: {}, create: { id: pastId, open: false, droppedAt: past } })
      await tx.media.upsert({ where: { id: sampleId(500) }, update: {}, create: { id: sampleId(500), kind: 'freezer', filename: freezerFilename, scheduleId: pastId } })
      await tx.schedule.updateMany({ where: { id: pastId, photoId: null }, data: { photoId: sampleId(500) } })
      for (const customer of sampleCustomers) {
        await tx.customer.upsert({ where: { id: customer.id }, update: {}, create: { ...customer, tokenHash: createHash('sha256').update(sampleToken(customer.id)).digest('hex') } })
      }
      for (const [index, fixture] of sampleOrders.entries()) {
        const id = sampleId(100 + index)
        if (await tx.order.findUnique({ where: { id } })) continue
        const scheduleId = fixture.past ? pastId : drops[0]!.id
        await tx.$queryRaw`SELECT id FROM schedules WHERE id = ${scheduleId} FOR UPDATE`
        const last = await tx.order.aggregate({ where: { scheduleId }, _max: { sequence: true } })
        const sequence = (last._max.sequence ?? 0) + 1
        const hasReceipt = fixture.status !== 'pending_payment'
        const receiptId = hasReceipt ? sampleId(300 + index) : null
        await tx.order.create({ data: {
          id, varietyId: fixture.customer % 2 ? 'tebu-2' : 'tebu-1', varietyName: `Tebu ${fixture.customer % 2 + 1}`, token: sampleToken(id), requestId: sampleId(200 + index), customerId: sampleCustomers[fixture.customer]!.id,
          scheduleId, sequence, tag: `#A${String(sequence).padStart(2, '0')}`, cart: fixture.cart,
          bottles: bottleCount(fixture.cart), total: total(fixture.cart), status: fixture.status,
          packed: fixture.packed ?? false, notified: fixture.past ?? false,
          createdAt: fixture.past ? past : now,
          expiresAt: new Date((fixture.past ? past : now).getTime() + (fixture.expired ? -20 : 20) * 60_000),
          items: { create: products.filter(product => fixture.cart[product.id] > 0).map(product => ({ productId: product.id, quantity: fixture.cart[product.id], unitPrice: product.price })) },
        } })
        if (receiptId) {
          await tx.media.create({ data: { id: receiptId, filename: receiptFilename, kind: 'receipt', orderId: id } })
          await tx.order.update({ where: { id }, data: { receiptId } })
        }
      }
      await tx.expense.upsert({ where: { id: sampleId(600) }, update: {}, create: { id: sampleId(600), date: now, amount: 2450, note: 'Sample bottles and paper bags' } })
      await tx.expense.upsert({ where: { id: sampleId(601) }, update: {}, create: { id: sampleId(601), date: past, amount: 1200, note: 'Sample transport' } })
      await tx.harvest.upsert({ where: { id: sampleId(700) }, update: {}, create: { id: sampleId(700), date: past, type: 'Tebu 1', varietyId: 'tebu-1', quantity: 25.5, flaskQty: 40, jugQty: 20 } })
      await tx.harvest.upsert({ where: { id: sampleId(701) }, update: {}, create: { id: sampleId(701), date: past, type: 'Tebu 2', varietyId: 'tebu-2', quantity: 20, flaskQty: 30, jugQty: 15 } })
    }, { timeout: 30_000 })
    console.log('Sample data ready: products, 4 customers, 8 orders, 2 expenses, 2 harvests, receipt/freezer images. Existing records are preserved.')
    console.log('Local customer bearer tokens:')
    for (const customer of sampleCustomers) console.log(`${customer.name} (${customer.phone}): ${sampleToken(customer.id)}`)
    console.log('Sample pickup tickets:')
    for (const [index, fixture] of sampleOrders.entries()) console.log(`${fixture.status}: /drop?t=${sampleToken(sampleId(100 + index))}`)
  } else {
    await database.schedule.createMany({ data: defaultMonthSchedules(now), skipDuplicates: true })
  }
  console.log('Current and next month Mon–Thu dates prepared. Closed or removed dates stay unavailable.')
} finally { await database.$disconnect() }
