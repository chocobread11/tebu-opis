import 'dotenv/config'
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { randomBytes, randomUUID, createHmac } from 'node:crypto'
import { mkdtemp, rm, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import pg from 'pg'
import sharp from 'sharp'
import { chromium } from 'playwright'

const databaseName = `tebu_phone_test_${Date.now()}_${randomBytes(3).toString('hex')}`
const databaseUrl = new URL(process.env.NUXT_DATABASE_URL)
databaseUrl.pathname = `/${databaseName}`
const root = new pg.Client({ connectionString: process.env.NUXT_DATABASE_URL })
const database = new pg.Client({ connectionString: databaseUrl.toString() })
const uploads = await mkdtemp(join(tmpdir(), 'tebu-phone-'))
const port = '3051'
const base = `http://127.0.0.1:${port}`
const env = { ...process.env, NUXT_DATABASE_URL: databaseUrl.toString(), NUXT_ADMIN_KEY: randomBytes(32).toString('hex'), NUXT_UPLOAD_DIR: uploads, NUXT_UPLOAD_STORAGE: 'local', NUXT_PUBLIC_DEMO: 'false', NUXT_PUBLIC_TESTING_CALENDAR: 'true', NODE_ENV: 'development', NITRO_HOST: '127.0.0.1', NITRO_PORT: port }
let server, browser, debugPage, created = false, output = ''
const run = args => {
  const result = spawnSync('bun', args, { env, encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr || result.stdout)
}
const request = async (path, { authorization, body, ...options } = {}) => {
  const response = await fetch(base + path, { ...options, headers: { ...(authorization ? { Authorization: authorization } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined })
  return { status: response.status, data: await response.json() }
}
try {
  await root.connect()
  await root.query(`CREATE DATABASE "${databaseName}"`); created = true
  run(['prisma', 'migrate', 'deploy'])
  run(['run', 'db:seed:week'])
  await database.connect()
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kuala_Lumpur', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
  await database.query("INSERT INTO schedules(id) SELECT to_char(day, 'YYYY-MM-DD') FROM generate_series($1::date, $1::date + 4, interval '1 day') AS day ON CONFLICT DO NOTHING", [today])
  server = spawn(process.execPath, ['.output/server/index.mjs'], { env, stdio: ['ignore', 'pipe', 'pipe'] })
  server.stdout.on('data', chunk => { output += chunk }); server.stderr.on('data', chunk => { output += chunk })
  let ready = false
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(base + '/api/health')).ok) { ready = true; break } } catch {}
    await delay(100)
  }
  assert.ok(ready, output)
  let catalog = await request('/api/catalog')
  assert.equal(catalog.status, 200)
  assert.equal(catalog.data.days.length, 5)
  assert.equal(catalog.data.days[0].id, today)
  assert.equal(catalog.data.drops[0].id, today)
  const anotherCustomer = await request('/api/identity', { method: 'POST', body: { name: 'Shared Box Customer', phone: '0129990003' } })
  const sharedOrder = await request('/api/orders', { method: 'POST', authorization: `Bearer ${anotherCustomer.data.token}`, body: { requestId: randomUUID(), scheduleId: today, varietyId: 'tebu-1', cart: { kecik: 1, besar: 0, asam: 0, limau: 0 } } })
  assert.equal(sharedOrder.status, 200)
  catalog = await request('/api/catalog')
  const initialDay = catalog.data.days[0]

  browser = await chromium.launch({ headless: true })
  const laptop = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  const page = await laptop.newPage()
  debugPage = page
  page.setDefaultTimeout(12000)
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(base, { waitUntil: 'networkidle' })
  const box = page.locator('#section-week .bottle-box')
  await box.waitFor()
  assert.equal(await page.locator('#section-week .week-date').count(), 5)
  assert.equal(await page.locator('#section-week .week-date').first().getAttribute('data-date'), today)
  assert.equal(await box.locator('.box-bottle:not(.box-bottle-vacant)').count(), initialDay.kecikUsed + initialDay.besarUsed)
  assert.equal(await box.locator('.box-bottle-vacant').count(), initialDay.remaining)
  await page.getByRole('button', { name: 'Add Botol Kecik', exact: true }).click()
  await page.getByRole('button', { name: 'Add Botol Besar', exact: true }).click()
  assert.equal(await box.locator('.box-bottle-kecik:not(.box-bottle-vacant)').count(), initialDay.kecikUsed, 'Adding to your cart does not change shared reservations')
  assert.equal(await box.locator('.box-bottle-besar:not(.box-bottle-vacant)').count(), initialDay.besarUsed)
  const alternateDay = catalog.data.days.find(day => day.id !== today && day.open && day.remaining > 0)
  await page.locator(`.week-date[data-date="${alternateDay.id}"]`).click()
  assert.equal(await box.locator('.box-bottle:not(.box-bottle-vacant)').count(), alternateDay.kecikUsed + alternateDay.besarUsed, 'Box follows the selected day')
  await page.locator(`.week-date[data-date="${today}"]`).click()
  assert.ok((await box.getAttribute('aria-label')).includes('across all orders'))
  await mkdir('test-results', { recursive: true })
  await page.locator('#section-week').screenshot({ path: 'test-results/bottle-box-desktop.png' })
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 900 })
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
    await page.locator('#section-week').screenshot({ path: `test-results/bottle-box-${width}.png` })
  }
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.getByRole('button', { name: 'LOCK MY BOTTLE', exact: true }).click()
  await page.getByLabel('Malaysian mobile number').fill('0129990001')
  await page.getByLabel('What should we write on your bag?').fill('Phone Upload Test')
  await page.getByRole('button', { name: 'Continue to payment', exact: true }).click()
  await page.getByRole('button', { name: 'Upload it from my phone', exact: true }).click()
  const phoneLink = page.getByRole('link', { name: 'Open receipt upload page', exact: true })
  await phoneLink.waitFor()
  const url = new URL(await phoneLink.getAttribute('href'))
  const token = url.searchParams.get('t')
  const authorization = `Receipt ${url.hash.slice(1)}`
  const sessionCookie=(await laptop.cookies()).find(cookie=>cookie.name==='tebu_customer_session')
  assert.ok(sessionCookie?.httpOnly)
  assert.equal(await page.evaluate(() => localStorage.getItem('customer_token')),null)
  assert.equal((await request(`/api/orders/${token}/receipt-link`, { method: 'POST', body: {} })).status, 401)
  assert.equal((await request(`/api/orders/${token}/receipt-upload`, { authorization: `Receipt ${'a'.repeat(43)}` })).status, 403)
  assert.equal((await request('/api/orders', { authorization })).status, 401, 'Upload credential cannot access customer history')
  const other = await request('/api/identity', { method: 'POST', body: { name: 'Another Customer', phone: '0129990002' } })
  assert.equal((await request(`/api/orders/${token}/receipt-link`, { method: 'POST', authorization: `Bearer ${other.data.token}`, body: {} })).status, 403)
  const saved = (await database.query('SELECT o.expires_at, c.token_hash FROM orders o JOIN customers c ON c.id = o.customer_id WHERE o.token = $1', [token])).rows[0]
  const expiredAt = new Date(Date.now() - 60_000)
  await database.query('UPDATE orders SET expires_at = $1 WHERE token = $2', [expiredAt, token])
  const expiredSignature = createHmac('sha256', saved.token_hash).update(`receipt-upload:${token}:${expiredAt.toISOString()}`).digest('base64url')
  assert.equal((await request(`/api/orders/${token}/receipt-upload`, { authorization: `Receipt ${expiredSignature}` })).status, 410)
  await database.query('UPDATE orders SET expires_at = $1 WHERE token = $2', [saved.expires_at, token])
  await page.getByRole('button', { name: 'I’ve paid — upload receipt', exact: true }).click()
  await page.getByRole('button', { name: 'Hide phone upload QR', exact: true }).waitFor()
  await page.locator('.checkout-drawer').screenshot({ path: 'test-results/phone-upload-drawer.png' })
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const phonePage = await phone.newPage()
  await phonePage.goto(url.toString())
  await phonePage.getByRole('heading', { name: 'Upload your receipt.', exact: true }).waitFor()
  assert.equal(await phonePage.locator('.bottom-nav, .app-header, .checkout-drawer').count(), 0, 'Phone page is receipt-only')
  // Some browsers return PNG when asked to encode WebP; exercise JPEG fallback end to end.
  await phonePage.evaluate(() => {
    const native = HTMLCanvasElement.prototype.toBlob
    HTMLCanvasElement.prototype.toBlob = function(callback, type, quality) {
      return native.call(this, callback, type === 'image/webp' ? 'image/png' : type, quality)
    }
  })
  const receipt = await sharp({ create: { width: 400, height: 500, channels: 3, background: '#eeeeee' } }).png().toBuffer()
  await phonePage.getByLabel('Payment receipt', { exact: true }).setInputFiles({ name: 'test-receipt.png', mimeType: 'image/png', buffer: receipt })
  const submit = phonePage.getByRole('button', { name: 'Submit payment receipt', exact: true })
  await submit.waitFor()
  await phonePage.waitForFunction(() => !!document.querySelector('.upload-zone img') && !document.querySelector('button[type="submit"]').disabled)
  assert.equal(await phonePage.locator('.upload-zone img').evaluate(async image => (await (await fetch(image.src)).blob()).type), 'image/jpeg', 'Phone receipt uses the JPEG fallback')
  await phonePage.locator('.receipt-only-page').screenshot({ path: 'test-results/phone-receipt-page.png' })
  await submit.click()
  await phonePage.getByRole('heading', { name: 'Receipt received.', exact: true }).waitFor()
  await page.bringToFront()
  await page.getByText('Your order receipt is ready', { exact: true }).waitFor({ timeout: 12000 })
  const persisted = (await database.query('SELECT status, receipt_id FROM orders WHERE token = $1', [token])).rows[0]
  assert.equal(persisted.status, 'pending_review')
  assert.ok(persisted.receipt_id)
  const afterCheckout = (await request('/api/catalog')).data.days.find(day => day.id === today)
  assert.equal(afterCheckout.kecikUsed, initialDay.kecikUsed + 1)
  assert.equal(afterCheckout.besarUsed, initialDay.besarUsed + 1)
  assert.equal(afterCheckout.remaining, initialDay.remaining - 3)
  const observer = await browser.newPage()
  await observer.goto(base, { waitUntil: 'networkidle' })
  assert.equal(await observer.locator('.box-bottle:not(.box-bottle-vacant)').count(), afterCheckout.kecikUsed + afterCheckout.besarUsed, 'Another visitor sees the same daily reservations')
  await database.query('UPDATE schedules SET capacity = $1 WHERE id = $2', [afterCheckout.kecikUsed + 2 * afterCheckout.besarUsed, today])
  await observer.reload({ waitUntil: 'networkidle' })
  await observer.locator(`.week-date[data-date="${today}"]`).click()
  assert.equal(await observer.locator('.box-bottle-vacant').count(), 0, 'A full day has no empty spaces, even when size limits add up to more than its total capacity')
  assert.equal(await observer.getByRole('button', { name: 'Add Botol Kecik', exact: true }).isDisabled(), true)
  assert.equal(await observer.getByRole('button', { name: 'Add Botol Besar', exact: true }).isDisabled(), true)
  await database.query('UPDATE schedules SET capacity = $1 WHERE id = $2', [initialDay.capacity, today])
  await database.query("UPDATE orders SET expires_at = now() - interval '1 minute' WHERE token = $1", [sharedOrder.data.token])
  const afterExpiry = (await request('/api/catalog')).data.days.find(day => day.id === today)
  assert.equal(afterExpiry.kecikUsed, afterCheckout.kecikUsed - 1, 'Expired unpaid orders release their slots')
  await observer.close()

  assert.equal((await request(`/api/media/${persisted.receipt_id}`, { authorization })).status, 401)
  await phonePage.reload()
  await phonePage.getByRole('heading', { name: 'Receipt received.', exact: true }).waitFor()
  assert.deepEqual(errors, [])
  run(['run', 'db:reset:week'])
  const counts = (await database.query('SELECT (SELECT count(*)::int FROM schedules) AS schedules, (SELECT count(*)::int FROM orders) AS orders, (SELECT count(*)::int FROM customers) AS customers, (SELECT count(*)::int FROM customer_sessions) AS sessions')).rows[0]
  assert.deepEqual(counts, { schedules: 9, orders: 72, customers: 12, sessions: 0 })
  assert.equal(Number((await database.query('SELECT count(*) FROM orders WHERE token = $1', [token])).rows[0].count), 0)
  console.log('PASS: shared daily bottle box, per-date counts, other-customer reservations, full-day limits and expiry, responsive layout, payment/receipt QR links, separate phone upload, laptop polling, private media, signature/ownership/expiry guards, and local reset with nine schedules and 72 fresh orders.')
} catch (error) {
  if (debugPage) {
    console.error('Page alerts:', await debugPage.locator('[role=alert]').allTextContents())
    console.error('Page state:', await debugPage.locator('.bottle-availability, .week-grid, .variety-picker').allTextContents())
    await debugPage.screenshot({ path: 'test-results/phone-receipt-failure.png', fullPage: true }).catch(() => {})
  }
  throw error
} finally {
  await browser?.close()
  if (server) {
    const exited = new Promise(resolve => server.once('exit', resolve))
    server.kill('SIGTERM'); await Promise.race([exited, delay(3000)])
  }
  await database.end().catch(() => {})
  if (created) await root.query(`DROP DATABASE "${databaseName}" WITH (FORCE)`)
  await root.end().catch(() => {})
  await rm(uploads, { recursive: true, force: true })
}
