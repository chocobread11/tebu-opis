import { migrateStoredTicket } from '../shared/legacy-products'
import 'dotenv/config'
import { createHash } from 'node:crypto'
import { mkdir, writeFile, unlink } from 'node:fs/promises'
import { resolve } from 'node:path'
import sharp from 'sharp'
import { createDatabase } from '../server/db/client'
import { malaysiaToday, products, total, bottleCount, bottleSpaces, type Cart, type Ticket } from '../shared/domain'
import { dailyBottleUsage } from '../server/utils/inventory'
import { sampleToken } from './seed-data'
import { developmentSeedRange } from './seed-range'

if (process.env.NODE_ENV === 'production') throw new Error('Weekly sample data is for development only.')
if (!process.env.NUXT_DATABASE_URL) throw new Error('Set NUXT_DATABASE_URL first.')
const database = createDatabase(process.env.NUXT_DATABASE_URL)
const now = new Date()
const week = developmentSeedRange(now)
const reset = process.argv.includes('--reset')
if (process.argv.slice(2).some(arg => arg !== '--reset')) throw new Error('Usage: bun run db:seed:week [--reset]')
if (reset && !['127.0.0.1', 'localhost', '[::1]'].includes(new URL(process.env.NUXT_DATABASE_URL).hostname)) throw new Error('Reset is restricted to a local development database.')
const today = malaysiaToday(now)
const fixtureId = (label: string) => {
  const hex = createHash('sha256').update(`tebu-week:${week.start}:${label}`).digest('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`
}
const names = ['Amirul', 'Nadia', 'Wei', 'Aina', 'Daniel', 'Mei', 'Ravi', 'Farah', 'Hafiz', 'Priya', 'Jason', 'Siti']
const expenseNotes = ['Sample ziplock pouches and paper bags', 'Sample bottle caps and labels', 'Sample pantry delivery transport', 'Sample asam boi and limau kasturi', 'Sample cleaning and packing supplies']
let added = 0

try {
  const directory = resolve(process.env.NUXT_UPLOAD_DIR || './data/uploads')
  const previousMedia = reset ? await database.media.findMany({ select: { filename: true } }) : []
  await mkdir(directory, { recursive: true, mode: 0o700 })
  const filename = 'sample-week-receipt.webp'
  const receipt = await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400"><rect width="640" height="400" fill="#f2f2f2"/><text x="40" y="160" font-family="sans-serif" font-size="30">SAMPLE PAYMENT RECEIPT</text><text x="40" y="220" font-family="sans-serif" font-size="20">Development fixture - no real payment</text></svg>')).webp().toBuffer()
  await writeFile(resolve(directory, filename), receipt, { mode: 0o600 })
  const freezerFilename = 'sample-week-freezer.webp'
  const freezer = await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="960" height="640"><rect width="960" height="640" fill="#f2f2f0"/><rect x="120" y="72" width="720" height="496" rx="24" fill="#e7e7e2" stroke="#c9c9c2" stroke-width="4"/><rect x="155" y="112" width="650" height="380" rx="12" fill="#fafaf8"/><path d="M155 345H805M155 470H805" stroke="#d4d4ce" stroke-width="8"/><rect x="210" y="210" width="180" height="112" rx="8" fill="#e8e4d9"/><rect x="420" y="210" width="180" height="112" rx="8" fill="#e8e4d9"/><rect x="630" y="210" width="140" height="112" rx="8" fill="#e8e4d9"/><text x="480" y="545" text-anchor="middle" font-family="sans-serif" font-size="22" fill="#555">SAMPLE FREEZER DROP PHOTO</text></svg>')).webp().toBuffer()
  await writeFile(resolve(directory, freezerFilename), freezer, { mode: 0o600 })
  await database.$transaction(async tx => {
    if (reset) {
      await tx.order.updateMany({ data: { receiptId: null } })
      await tx.schedule.updateMany({ data: { photoId: null } })
      await tx.media.deleteMany()
      await tx.telegramNotification.deleteMany()
      await tx.refund.deleteMany()
      await tx.auditEvent.deleteMany()
      await tx.order.deleteMany()
      await tx.adminSession.deleteMany()
      await tx.customerSession.deleteMany()
      await tx.customer.deleteMany()
      await tx.expense.deleteMany()
      await tx.stockEntry.deleteMany()
      await tx.harvest.deleteMany()
      await tx.schedule.deleteMany()
      await tx.stockEntry.deleteMany()
      await tx.product.deleteMany()
      await tx.caneVariety.deleteMany()
    }
    for (const [sortOrder, product] of products.entries()) await tx.product.upsert({ where: { id: product.id }, update: {}, create: { ...product, sortOrder } })
    for (const [index, p] of products.filter(p => p.kind === 'bottle').entries()) {
      await tx.stockEntry.upsert({ where: { id: fixtureId(`restock-${index}`) }, update: {}, create: { id: fixtureId(`restock-${index}`), productId: p.id, date: new Date(`${today}T00:00:00Z`), quantity: p.spaceCost === 2 ? 30 : 60, note: 'Sample starting stock' } })
    }
    for (const [index, name] of names.entries()) {
      const id = fixtureId(`customer-${index}`)
      const phone = '6011' + String(parseInt(createHash('sha256').update(week.start).digest('hex').slice(0, 8), 16) % 1_000_000).padStart(6, '0') + String(index).padStart(2, '0')
      await tx.customer.upsert({ where: { id }, update: { phone }, create: { id, phone, name: `${name} Sample`, tokenHash: createHash('sha256').update(sampleToken(id)).digest('hex') } })
    }
    for (const [dayIndex, scheduleId] of week.days.entries()) {
      const schedule = await tx.schedule.upsert({ where: { id: scheduleId }, update: {}, create: { id: scheduleId } })
      if (scheduleId === today && !schedule.droppedAt) {
        const photoId = fixtureId(`freezer-${scheduleId}`)
        await tx.media.upsert({ where: { id: photoId }, update: { filename: freezerFilename, kind: 'freezer', scheduleId }, create: { id: photoId, filename: freezerFilename, kind: 'freezer', scheduleId } })
        await tx.schedule.update({ where: { id: scheduleId }, data: { photoId, droppedAt: new Date(`${scheduleId}T09:00:00+08:00`), open: false } })
      }
      const expenseId = fixtureId(`expense-${dayIndex}`)
      await tx.expense.upsert({ where: { id: expenseId }, update: {}, create: { id: expenseId, date: new Date(`${scheduleId}T00:00:00Z`), amount: [1850, 2400, 1200, 1650, 950][dayIndex % 5]!, note: expenseNotes[dayIndex % expenseNotes.length]!, scheduleId } })
      // Keep calendar closures and existing reservations intact.
      if (!schedule.open || schedule.removedAt || schedule.droppedAt) continue
      await tx.$queryRaw`SELECT id FROM schedules WHERE id = ${scheduleId} FOR UPDATE`
      const usage = await dailyBottleUsage(tx, scheduleId)
      let spaceLeft = Math.max(0, schedule.capacity - usage.spaces)
      const last = await tx.order.aggregate({ where: { scheduleId }, _max: { sequence: true } })
      let sequence = last._max.sequence ?? 0
      for (let index = 0; index < 8; index++) {
        const id = fixtureId(`order-${scheduleId}-${index}`)
        const existing = await tx.order.findUnique({ where: { id } })
        if (existing) continue
        const expired = index === 6
        let status: Ticket['status'] = index === 7 ? 'rejected' : index === 5 || expired ? 'pending_payment' : index === 4 ? 'pending_review' : 'confirmed'
        if (scheduleId <= today && index === 0) status = 'collected'
        if (scheduleId <= today && index === 1) status = 'ready'
        const varietyId = `tebu-${(index + dayIndex) % 2 + 1}`
        const cart: Cart = migrateStoredTicket({ varietyId, cart: { kecik: index % 3 === 1 ? 0 : 1, besar: index % 3 === 1 ? 1 : 0, asam: index % 2, limau: (index + dayIndex) % 2 } } as unknown as Ticket).cart
        if (status !== 'rejected' && !expired) {
          if (bottleSpaces(cart) > spaceLeft) status = 'rejected'
          else spaceLeft -= bottleSpaces(cart)
        }
        sequence++
        const customer = (dayIndex * 3 + index) % names.length
        const createdAt = new Date(Math.min(now.getTime(), new Date(`${scheduleId}T08:00:00+08:00`).getTime()) - (8 - index) * 12 * 60_000)
        const receiptId = status !== 'pending_payment' ? fixtureId(`receipt-${scheduleId}-${index}`) : null
        await tx.order.create({ data: {
          id, token: sampleToken(id), requestId: fixtureId(`request-${scheduleId}-${index}`), customerId: fixtureId(`customer-${customer}`),
          scheduleId, sequence, cart, bottles: bottleCount(cart), total: total(cart), status,fulfilled:status==='collected',
          packed: ['ready', 'collected'].includes(status) || status === 'confirmed' && index === 2,
          notified: ['ready', 'collected'].includes(status), createdAt, expiresAt: new Date(now.getTime() + (expired ? -60 : 20) * 60_000),
          items: { create: products.filter(p => cart[p.id]).map(p => ({ productId: p.id, quantity: cart[p.id] ?? 0, unitPrice: p.price, name: p.name, size: p.size, kind: p.kind, spaceCost: p.spaceCost ?? 0 })) },
        } })
        if (receiptId) {
          await tx.media.create({ data: { id: receiptId, filename, kind: 'receipt', orderId: id } })
          await tx.order.update({ where: { id }, data: { receiptId } })
        }
        added++
      }
    }
  }, { timeout: 30_000 })
  if (reset) {
    const oldFiles = new Set(previousMedia.map(media => media.filename).filter(name => /^[\w-]+\.webp$/.test(name) && name !== filename && name !== freezerFilename))
    for (const name of oldFiles) {
      try { await unlink(resolve(directory, name)) }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
    }
  }
  console.log(`Development samples ready for ${week.label}: ${added} new orders, 12 sample customers, 4 restocks, 9 expenses. ${reset ? 'Previous database records purged.' : 'Existing data and closures preserved.'}`)
  console.log(JSON.stringify({ orders: await database.order.groupBy({ by: ['scheduleId', 'status'], where: { scheduleId: { gte: week.start, lte: week.end } }, _count: true }), stock: await database.stockEntry.findMany() }, null, 2))
} finally { await database.$disconnect() }
