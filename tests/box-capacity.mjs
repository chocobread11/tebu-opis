import 'dotenv/config'
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { randomBytes, randomUUID } from 'node:crypto'
import { mkdir, readFile } from 'node:fs/promises'
import { setTimeout as delay } from 'node:timers/promises'
import pg from 'pg'
import { chromium } from 'playwright'

// All fixtures and destructive cleanup are isolated in this throwaway database.
const name = `tebu_box_test_${Date.now()}_${randomBytes(3).toString('hex')}`
const url = new URL(process.env.NUXT_DATABASE_URL); url.pathname = `/${name}`
const root = new pg.Client({ connectionString: process.env.NUXT_DATABASE_URL })
const sql = new pg.Client({ connectionString: url.toString() })
const key = randomBytes(32).toString('hex')
const env = { ...process.env, NUXT_DATABASE_URL: url.toString(), NUXT_ADMIN_KEY: key, NUXT_PUBLIC_DEMO: 'false', NUXT_PUBLIC_TESTING_CALENDAR: 'true', NUXT_PUBLIC_DUITNOW_QR: '/favicon.svg', NITRO_HOST: '127.0.0.1', NITRO_PORT: '3054', NODE_ENV: 'development' }
const base = 'http://127.0.0.1:3054'
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kuala_Lumpur', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
const day = offset => { const date = new Date(`${today}T00:00:00Z`); date.setUTCDate(date.getUTCDate() + offset); return date.toISOString().slice(0, 10) }
const cart = (kecik, besar) => ({ kecik, besar, asam: 0, limau: 0 })
const request = async (path, { token, body, ...options } = {}) => {
  const response = await fetch(base + path, { ...options, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined })
  return { status: response.status, data: await response.json() }
}
let server, browser, created = false, output = '', customerToken
const checkout = (scheduleId, quantities, varietyId = 'tebu-1', requestId = randomUUID()) => request('/api/orders', { method: 'POST', token: customerToken, body: { scheduleId, varietyId, requestId, cart: quantities } })
const availability = async id => (await request('/api/catalog')).data.days.find(row => row.id === id)
const reset = async () => {
  await sql.query('DELETE FROM orders')
  await sql.query('UPDATE schedules SET capacity=12, kecik_capacity=12, besar_capacity=6')
}
try {
  await root.connect(); await root.query(`CREATE DATABASE "${name}"`); created = true
  const migrated = spawnSync('bun', ['prisma', 'migrate', 'deploy'], { env, encoding: 'utf8' })
  assert.equal(migrated.status, 0, migrated.stderr || migrated.stdout)
  await sql.connect()
  await sql.query("INSERT INTO schedules(id) SELECT to_char(day, 'YYYY-MM-DD') FROM generate_series($1::date, $1::date + 4, interval '1 day') AS day", [today])
  await sql.query("INSERT INTO harvests(date,quantity,type,variety_id,kecik_qty,besar_qty) SELECT $1::date,1,name,id,500,500 FROM cane_varieties", [today])
  server = spawn(process.execPath, ['.output/server/index.mjs'], { env, stdio: ['ignore', 'pipe', 'pipe'] })
  server.stdout.on('data', chunk => { output += chunk }); server.stderr.on('data', chunk => { output += chunk })
  let ready = false
  for (let i = 0; i < 100; i++) { try { if ((await fetch(base + '/api/health')).ok) { ready = true; break } } catch {} await delay(100) }
  assert.ok(ready, output)
  const identity = await request('/api/identity', { method: 'POST', body: { name: 'Shared Box Test', phone: '0129990044' } })
  assert.equal(identity.status, 200); customerToken = identity.data.token

  // The legacy per-size columns no longer impose separate limits.
  await sql.query('UPDATE schedules SET kecik_capacity=8, besar_capacity=3')
  for (const [offset, quantities] of [[0, cart(12, 0)], [1, cart(0, 6)], [2, cart(4, 4)]]) {
    const requestId = randomUUID()
    const result = await checkout(day(offset), quantities, 'tebu-1', requestId)
    assert.equal(result.status, 200, JSON.stringify(result))
    assert.equal((await checkout(day(offset), quantities, 'tebu-1', requestId)).data.token, result.data.token, 'Retry does not reserve twice')
    assert.equal((await availability(day(offset))).remaining, 0)
    assert.equal((await checkout(day(offset), cart(1, 0), 'tebu-2')).status, 409, 'All varieties share the same daily box')
    assert.equal((await sql.query('SELECT bottles FROM orders WHERE token=$1', [result.data.token])).rows[0].bottles, quantities.kecik + quantities.besar)
  }
  const almost = await checkout(day(3), cart(1, 5)); assert.equal(almost.status, 200)
  const last = await availability(day(3)); assert.equal(last.remaining, 1); assert.equal(last.kecikRemaining, 1); assert.equal(last.besarRemaining, 0)
  assert.equal((await checkout(day(3), cart(0, 1))).status, 409, 'One free space cannot hold a Besar')
  assert.equal((await checkout(day(3), cart(1, 0))).status, 200)
  console.log('PASS: 12 Kecik, 6 Besar, mixed sizes, last space, cross-variety sharing and checkout retries')

  await reset()
  assert.equal((await checkout(day(1), cart(8, 0))).status, 200)
  const race = await Promise.all([checkout(day(1), cart(0, 2)), checkout(day(1), cart(4, 0), 'tebu-2')])
  assert.deepEqual(race.map(row => row.status).sort(), [200, 409], 'Simultaneous mixed orders cannot overfill the box')
  assert.equal((await availability(day(1))).remaining, 0)
  await reset()
  const expiring = await checkout(day(1), cart(0, 6)); assert.equal(expiring.status, 200)
  await sql.query("UPDATE orders SET expires_at=now()-interval '1 minute' WHERE token=$1", [expiring.data.token])
  assert.equal((await availability(day(1))).remaining, 12)
  const replacement = await checkout(day(1), cart(0, 6)); assert.equal(replacement.status, 200)
  await sql.query("UPDATE orders SET status='rejected' WHERE token=$1", [replacement.data.token])
  assert.equal((await availability(day(1))).remaining, 12)
  console.log('PASS: concurrent mixed-size reservations, expired and rejected reservations release weighted capacity')

  await reset()
  const manualBody = { requestId: randomUUID(), scheduleId: day(1), name: 'Manual Box Test', phone: '', varietyId: 'tebu-1', paymentStatus: 'paid', cart: cart(4, 4) }
  const manual = await request('/api/admin/orders', { method: 'POST', token: key, body: manualBody }); assert.equal(manual.status, 200)
  assert.equal((await checkout(day(1), cart(1, 0))).status, 409)
  assert.equal((await request(`/api/admin/schedules/${day(1)}`, { method: 'PUT', token: key, body: { open: true, capacity: 11 } })).status, 409, 'Capacity cannot fall below existing weighted usage')
  assert.equal((await request(`/api/admin/schedules/${day(1)}`, { method: 'PUT', token: key, body: { open: true, capacity: 14 } })).status, 200)
  assert.deepEqual((await sql.query('SELECT capacity,kecik_capacity,besar_capacity FROM schedules WHERE id=$1', [day(1)])).rows[0], { capacity: 14, kecik_capacity: 14, besar_capacity: 7 })
  const edit = { name: manualBody.name, scheduleId: day(1), varietyId: 'tebu-1', paymentStatus: 'paid', status: 'confirmed', cart: cart(3, 6) }
  assert.equal((await request(`/api/admin/orders/${manual.data.token}`, { method: 'PATCH', token: key, body: edit })).status, 409)
  assert.deepEqual((await sql.query('SELECT cart FROM orders WHERE token=$1', [manual.data.token])).rows[0].cart, manualBody.cart, 'Invalid edit rolls back')
  // Restoring a rejected online payment must fit alongside the manual order.
  const rejected = await checkout(day(1), cart(0, 1)); assert.equal(rejected.status, 200)
  await sql.query("UPDATE orders SET status='rejected' WHERE token=$1", [rejected.data.token])
  assert.equal((await checkout(day(1), cart(0, 1))).status, 200)
  assert.equal((await request(`/api/admin/orders/${rejected.data.token}/payment`, { method: 'PATCH', token: key, body: { paymentStatus: 'paid', expectedStatus: 'rejected', expectedPaymentStatus: 'rejected' } })).status, 409)
  assert.equal((await sql.query('SELECT status FROM orders WHERE token=$1', [rejected.data.token])).rows[0].status, 'rejected')
  console.log('PASS: manual orders, calendar capacity, edit rollback and payment-restoration capacity guards')

  // Replay the data conversion against an old 8-small / 3-big reservation.
  await reset()
  const preserved = await checkout(day(1), cart(8, 2)); assert.equal(preserved.status, 200)
  await sql.query("UPDATE schedules SET capacity=11,kecik_capacity=8,besar_capacity=3 WHERE id=$1", [day(1)])
  await sql.query("UPDATE orders SET cart=$1,bottles=11,status='confirmed' WHERE token=$2", [cart(8, 3), preserved.data.token])
  await sql.query("UPDATE order_items SET quantity=3 WHERE product_id='besar'")
  await sql.query('UPDATE schedules SET capacity=5 WHERE id=$1', [day(2)])
  // Expired/rejected fixtures must not inflate the migration's capacity.
  await checkout(day(3), cart(12, 0))
  await sql.query("UPDATE orders SET cart=$1,bottles=100,expires_at=now()-interval '1 minute' WHERE schedule_id=$2", [cart(100, 0), day(3)])
  await sql.query("UPDATE order_items SET quantity=100 WHERE order_id IN (SELECT id FROM orders WHERE schedule_id=$1)", [day(3)])
  await sql.query(await readFile('prisma/migrations/202611120003_shared_box_capacity/migration.sql', 'utf8'))
  assert.equal((await sql.query('SELECT capacity FROM schedules WHERE id=$1', [day(1)])).rows[0].capacity, 14)
  assert.equal((await sql.query('SELECT capacity FROM schedules WHERE id=$1', [day(2)])).rows[0].capacity, 5)
  assert.equal((await sql.query('SELECT capacity FROM schedules WHERE id=$1', [day(3)])).rows[0].capacity, 12)
  assert.equal((await sql.query('SELECT bottles FROM orders WHERE token=$1', [preserved.data.token])).rows[0].bottles, 11)
  console.log('PASS: migration preserves custom capacities, existing orders and reservations exceeding the new default')

  await reset()
  browser = await chromium.launch({ headless: true })
  await mkdir('test-results', { recursive: true })
  for (const width of [390, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, extraHTTPHeaders: { 'X-Forwarded-For': `127.0.0.${width === 390 ? 7 : 8}` } }); page.setDefaultTimeout(12000)
    const errors = []; page.on('pageerror', error => errors.push(error.message))
    await page.goto(base, { waitUntil: 'networkidle' })
    const small = page.getByRole('group', { name: 'Botol Kecik quantity', exact: true })
    const big = page.getByRole('group', { name: 'Botol Besar quantity', exact: true })
    assert.equal(await small.getByRole('spinbutton').getAttribute('aria-valuemax'), '12')
    assert.equal(await big.getByRole('spinbutton').getAttribute('aria-valuemax'), '6')
    for (let i = 0; i < 12; i++) await small.locator('.quantity-increase').click()
    assert.equal(await small.getByRole('spinbutton').inputValue(), '12')
    assert.ok(await small.locator('.quantity-increase').isDisabled()); assert.ok(await big.locator('.quantity-increase').isDisabled())
    for (let i = 0; i < 12; i++) await small.locator('.quantity-decrease').click()
    await big.locator('.quantity-increase').click()
    assert.equal(await small.getByRole('spinbutton').getAttribute('aria-valuemax'), '10')
    await small.locator('.quantity-increase').click()
    assert.equal(await big.getByRole('spinbutton').getAttribute('aria-valuemax'), '5')
    assert.equal((await checkout(today, cart(1, 5))).status, 200)
    await page.reload({ waitUntil: 'networkidle' })
    assert.equal(await small.getByRole('spinbutton').getAttribute('aria-valuemax'), '1')
    assert.ok(await big.locator('.quantity-increase').isDisabled())
    assert.equal(await page.locator('.box-bottle-besar').count(), 5)
    assert.equal(await page.locator('.box-bottle-besar').first().evaluate(element => getComputedStyle(element).gridColumnStart), 'span 2')
    assert.equal(await page.locator('.box-bottle-vacant').count(), 1)
    await page.locator('#section-week').screenshot({ path: `test-results/shared-box-${width}.png` })
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
    assert.deepEqual(errors, [])
    await page.close()
    await reset()
  }
  console.log('PASS: mobile/desktop quantity controls allow all 12 small bottles and recompute mixed-size limits')
  const adminPage = await browser.newPage({ viewport: { width: 1440, height: 1000 }, extraHTTPHeaders: { 'X-Forwarded-For': '127.0.0.9' } })
  await adminPage.goto(base + '/admin', { waitUntil: 'networkidle' })
  await adminPage.getByLabel('Admin key', { exact: true }).fill(key)
  await adminPage.getByRole('button', { name: 'Open pantry ops' }).click()
  await adminPage.getByRole('link', { name: 'Calendar', exact: true }).click()
  await adminPage.locator(`.calendar-date[data-date="${day(1)}"]`).click()
  const capacityInput = adminPage.getByLabel('Box capacity (spaces)', { exact: true })
  await capacityInput.waitFor(); assert.equal(await capacityInput.inputValue(), '12')
  assert.equal(await adminPage.locator('.calendar-editor input').count(), 1)
  await adminPage.locator('.admin-drop-picker').screenshot({ path: 'test-results/shared-box-admin.png' })
  await adminPage.close()
  console.log('PASS: admin calendar exposes a single shared-space capacity setting')
} finally {
  if (browser) await browser.close()
  if (server) { server.kill('SIGTERM'); await new Promise(resolve => server.once('exit', resolve)) }
  await sql.end()
  if (created) await root.query(`DROP DATABASE "${name}" WITH (FORCE)`)
  await root.end()
}
