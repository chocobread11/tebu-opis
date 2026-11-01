import 'dotenv/config'
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { randomBytes, randomUUID, createHash } from 'node:crypto'
import { mkdtemp, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import pg from 'pg'
import { chromium } from 'playwright'

if (!process.env.NUXT_DATABASE_URL) throw new Error('Set NUXT_DATABASE_URL first. The test creates and removes its own database on the same server.')
const databaseName = `tebu_test_${Date.now()}_${randomBytes(3).toString('hex')}`
const databaseUrl = new URL(process.env.NUXT_DATABASE_URL)
databaseUrl.pathname = `/${databaseName}`
const root = new pg.Client({ connectionString: process.env.NUXT_DATABASE_URL })
const database = new pg.Client({ connectionString: databaseUrl.toString() })
const uploads = await mkdtemp(join(tmpdir(), 'tebu-api-'))
const adminKey = randomBytes(32).toString('hex')
const port = process.env.TEBU_DATABASE_TEST_PORT || '3041'
const base = `http://127.0.0.1:${port}`
const env = { ...process.env, NUXT_DATABASE_URL: databaseUrl.toString(), NUXT_ADMIN_KEY: adminKey, NUXT_UPLOAD_DIR: uploads, NUXT_PUBLIC_DEMO: 'false', NUXT_PUBLIC_DUITNOW_QR: '/favicon.svg', NODE_ENV: 'development', NITRO_HOST: '127.0.0.1', NITRO_PORT: port }
let server, browser, debugPage, created = false
let serverOutput = ''
const run = args => {
  const result = spawnSync('bun', args, { env, encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr || result.stdout)
}
const request = async (path, { token, body, ...options } = {}) => {
  const headers = { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }
  const response = await fetch(`${base}${path}`, { ...options, headers, body: body ? JSON.stringify(body) : undefined })
  const data = await response.json()
  return { status: response.status, data }
}
const token = label => createHash('sha256').update(`tebu-sample:${label}`).digest('base64url')
const sampleId = number => `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`
try {
  await root.connect()
  await root.query(`CREATE DATABASE "${databaseName}"`)
  console.log('Temporary test database:', databaseName)
  created = true
  run(['prisma', 'migrate', 'deploy'])
  run(['prisma', 'db', 'seed'])
  await database.connect()
  const counts = async () => (await database.query('SELECT (SELECT count(*) FROM orders)::int AS orders, (SELECT count(*) FROM order_items)::int AS items, (SELECT count(*) FROM expenses)::int AS expenses, (SELECT count(*) FROM harvests)::int AS harvests')).rows[0]
  const initial = await counts()
  assert.equal(initial.orders, 8); assert.equal(initial.expenses, 2); assert.equal(initial.harvests, 2)
  run(['prisma', 'db', 'seed'])
  assert.deepEqual(await counts(), initial, 'Seeding twice must preserve row counts')
  server = spawn(process.execPath, ['.output/server/index.mjs'], { env, stdio: ['ignore', 'pipe', 'pipe'] })
  server.stdout.on('data', chunk => { serverOutput += chunk })
  server.stderr.on('data', chunk => { serverOutput += chunk })
  let ready = false
  for (let i = 0; i < 100; i++) {
    if (server.exitCode !== null || server.signalCode !== null) throw new Error(serverOutput)
    try { if ((await fetch(`${base}/api/health`)).ok) { ready = true; break } } catch {}
    await delay(100)
  }
  assert.ok(ready, 'Test server must start')
  const catalog = await request('/api/catalog')
  assert.equal(catalog.status, 200); assert.equal(catalog.data.products.length, 4)
  const scheduleId = catalog.data.drops[0].id
  for (const path of ['/api/admin', '/api/admin/logs']) assert.equal((await request(path)).status, 401)
  assert.equal((await request('/api/admin/logs/expenses', { method: 'POST', body: { date: '2026-11-01', amount: 100 } })).status, 401)

  for (const [kind, record, changes] of [
    ['expenses', { date: '2026-11-01', amount: 1234, note: 'API test' }, { amount: 1500 }],
    ['harvests', { date: '2026-11-01', quantity: 12.75, varietyId: 'tebu-1', flaskQty: 2, jugQty: 3 }, { quantity: 15.25 }],
  ]) {
    const created = await request(`/api/admin/logs/${kind}`, { method: 'POST', token: adminKey, body: record })
    assert.equal(created.status, 200)
    const updated = await request(`/api/admin/logs/${kind}/${created.data.id}`, { method: 'PATCH', token: adminKey, body: { ...record, ...changes } })
    assert.equal(updated.status, 200); assert.equal(updated.data.scheduleId, undefined)
    for (const [key, value] of Object.entries(changes)) assert.equal(updated.data[key], value)
    const logs = await request('/api/admin/logs', { token: adminKey })
    assert.ok(logs.data[kind].some(row => row.id === created.data.id))
    assert.equal((await request(`/api/admin/logs/${kind}/${created.data.id}`, { method: 'DELETE', token: adminKey })).status, 200)
    assert.equal((await request(`/api/admin/logs/${kind}/${created.data.id}`, { method: 'DELETE', token: adminKey })).status, 404)
  }
  for (const body of [{ date: '2026-02-30', amount: 100 }, { date: '2026-11-01', amount: -1 }, { date: '2026-11-01', amount: 1.5 }, { date: '2026-11-01', amount: 100, scheduleId: '1900-01-01' }]) {
    assert.equal((await request('/api/admin/logs/expenses', { method: 'POST', token: adminKey, body })).status, 400)
  }
  const importBody = { expenses: [{ id: randomUUID(), date: '2026-11-01', amount: 777, note: 'Imported fixture' }], harvests: [] }
  assert.equal((await request('/api/admin/logs/import', { method: 'POST', token: adminKey, body: importBody })).status, 200)
  assert.equal((await request('/api/admin/logs/import', { method: 'POST', token: adminKey, body: importBody })).status, 200)
  assert.equal(Number((await database.query('SELECT count(*) FROM expenses WHERE id = $1', [importBody.expenses[0].id])).rows[0].count), 1)

  const identity = await request('/api/identity', { method: 'POST', body: { name: 'API Customer', phone: '0129990001' } })
  assert.equal(identity.status, 200)
  const customerToken = identity.data.token
  await database.query("UPDATE products SET price = 725 WHERE id = 'flask'")
  assert.equal((await request('/api/orders', { method: 'POST', token: customerToken, body: { scheduleId, varietyId: 'tebu-1', requestId: randomUUID(), cart: { flask: 0, jug: 4, asam: 0, limau: 0 } } })).status, 409, 'Public checkout enforces the daily big bottle limit')
  const orderBody = { scheduleId, varietyId: 'tebu-1', requestId: randomUUID(), cart: { flask: 1, jug: 0, asam: 1, limau: 0 } }
  const order = await request('/api/orders', { method: 'POST', token: customerToken, body: orderBody })
  assert.equal(order.status, 200); assert.equal(order.data.total, 825); assert.equal(order.data.items.length, 2)
  assert.equal((await request('/api/orders', { method: 'POST', token: customerToken, body: orderBody })).data.token, order.data.token)
  await database.query("UPDATE products SET price = 600 WHERE id = 'flask'")
  assert.equal((await request(`/api/orders/${order.data.token}`)).data.items.find(row => row.productId === 'flask').unitPrice, 725, 'Tickets retain checkout prices')
  const history = await request('/api/orders', { token: customerToken })
  assert.equal(history.data.orders.length, 1)
  assert.equal((await request('/api/orders', { method: 'POST', token: token(sampleId(1)), body: orderBody })).status, 409)
  const form = new FormData()
  form.append('file', new Blob([await readFile(join(uploads, 'sample-receipt.webp'))], { type: 'image/webp' }), 'receipt.webp')
  form.append('orderToken', order.data.token)
  const upload = await fetch(`${base}/api/uploads`, { method: 'POST', headers: { Authorization: `Bearer ${customerToken}` }, body: form })
  assert.equal(upload.status, 200)
  const receipt = await upload.json()
  assert.equal((await fetch(`${base}/api/media/${receipt.id}`)).status, 401)
  assert.equal((await request(`/api/orders/${order.data.token}`, { method: 'PATCH', token: customerToken, body: { action: 'receipt', receiptId: receipt.id } })).data.status, 'pending_review')
  for (const action of ['approve', 'pack']) assert.equal((await request('/api/admin', { method: 'PATCH', token: adminKey, body: { action, orderToken: order.data.token } })).status, 200)
  const past = (await database.query('SELECT id, photo_id FROM schedules WHERE dropped_at IS NOT NULL LIMIT 1')).rows[0]
  await database.query('UPDATE orders SET schedule_id = $1, sequence = 99 WHERE token = $2', [past.id, order.data.token])
  assert.equal((await request('/api/admin', { method: 'PATCH', token: adminKey, body: { action: 'drop', scheduleId: past.id, photoId: past.photo_id } })).status, 200)
  assert.equal((await request(`/api/orders/${order.data.token}`)).data.status, 'ready')
  assert.equal((await request(`/api/orders/${order.data.token}`, { method: 'PATCH', body: { action: 'collect' } })).data.status, 'collected')
  const revenue = await request('/api/admin/logs', { token: adminKey })
  assert.equal(revenue.data.revenue, Number((await database.query("SELECT sum(total) AS total FROM orders WHERE status IN ('confirmed','ready','collected')")).rows[0].total))

  const lastDrop = catalog.data.drops.at(-1).id
  await database.query('UPDATE schedules SET capacity = 1 WHERE id = $1', [lastDrop])
  const reservations = await Promise.all([0, 1].map(() => request('/api/orders', { method: 'POST', token: customerToken, body: { scheduleId: lastDrop, varietyId: 'tebu-1', requestId: randomUUID(), cart: { flask: 1, jug: 0, asam: 0, limau: 0 } } })))
  assert.deepEqual(reservations.map(r => r.status).sort(), [200, 409], 'Concurrent checkout must enforce capacity')
  await assert.rejects(database.query("INSERT INTO expenses(date,amount,schedule_id) VALUES ('2026-11-01',100,'1900-01-01')"), /foreign key/)

  // Shared stock is independent of the selected delivery date.
  let live = (await request('/api/catalog')).data
  assert.equal(live.varieties.length, 2)
  assert.equal((await request('/api/admin/varieties', { method: 'PATCH', token: adminKey, body: { id: 'tebu-1', name: 'Tebu Madu Test', description: 'Our first garden variety' } })).status, 200)
  assert.equal((await request('/api/catalog')).data.varieties[0].name, 'Tebu Madu Test')
  assert.equal((await request(`/api/orders/${order.data.token}`)).data.varietyName, 'Tebu 1', 'Existing tickets retain the variety sold at checkout')
  const tebu2 = live.varieties.find(row => row.id === 'tebu-2')
  const consumed = tebu2.flaskQty - tebu2.flaskRemaining
  await database.query("UPDATE harvests SET flask_qty = $1 WHERE variety_id = 'tebu-2'", [consumed])
  const batch = await request('/api/admin/logs/harvests', { method: 'POST', token: adminKey, body: { date: '2026-11-01', varietyId: 'tebu-2', quantity: 0, flaskQty: 1, jugQty: 0 } })
  assert.equal(batch.status, 200)
  live = (await request('/api/catalog')).data
  assert.equal(live.varieties.find(row => row.id === 'tebu-2').flaskRemaining, 1)
  const raceDates = [catalog.data.drops.at(-2).id, catalog.data.drops.at(-3).id]
  const stockRace = await Promise.all(raceDates.map(id => request('/api/orders', { method: 'POST', token: customerToken, body: { scheduleId: id, varietyId: 'tebu-2', requestId: randomUUID(), cart: { flask: 1, jug: 0, asam: 0, limau: 0 } } })))
  assert.deepEqual(stockRace.map(row => row.status).sort(), [200, 409], 'A single bottle cannot be sold across two different dates')
  const won = stockRace.find(row => row.status === 200).data
  assert.equal((await request('/api/admin/logs/harvests/' + batch.data.id, { method: 'DELETE', token: adminKey })).status, 409, 'A harvest cannot be removed below reserved stock')
  assert.equal((await request('/api/admin/logs/harvests/' + batch.data.id, { method: 'PATCH', token: adminKey, body: { date: '2026-11-01', varietyId: 'tebu-2', quantity: 1, flaskQty: 0, jugQty: 0 } })).status, 409)
  const jugOrder = await request('/api/orders', { method: 'POST', token: customerToken, body: { scheduleId: raceDates[0], varietyId: 'tebu-2', requestId: randomUUID(), cart: { flask: 0, jug: 1, asam: 0, limau: 0 } } })
  assert.equal(jugOrder.status, 200, 'Jug stock stays separate from flask stock')
  await database.query("UPDATE orders SET expires_at = now() - interval '1 minute' WHERE token = $1", [won.token])
  assert.equal((await request('/api/catalog')).data.varieties.find(row => row.id === 'tebu-2').flaskRemaining, 1, 'Expired unpaid reservations release stock')
  assert.equal((await request('/api/admin/logs/harvests/' + batch.data.id, { method: 'DELETE', token: adminKey })).status, 200)
  assert.equal((await request('/api/admin/logs/harvests', { method: 'POST', token: adminKey, body: { date: '2026-11-01', varietyId: 'tebu-1', quantity: 1, flaskQty: 1.5, jugQty: 0 } })).status, 400)

  // Close days at the API, including a pending receipt; seed must not reopen them.
  const closeDate = catalog.data.drops[2].id
  const pending = await request('/api/orders', { method: 'POST', token: customerToken, body: { ...orderBody, scheduleId: closeDate, requestId: randomUUID() } })
  assert.equal(pending.status, 200)
  const closeForm = new FormData()
  closeForm.append('file', new Blob([await readFile(join(uploads, 'sample-receipt.webp'))], { type: 'image/webp' }), 'receipt.webp')
  closeForm.append('orderToken', pending.data.token)
  const closeUpload = await fetch(`${base}/api/uploads`, { method: 'POST', headers: { Authorization: `Bearer ${customerToken}` }, body: closeForm })
  assert.equal(closeUpload.status, 200)
  const closeReceipt = await closeUpload.json()
  assert.equal((await request(`/api/admin/schedules/${closeDate}`, { method: 'PUT', token: adminKey, body: { open: false, capacity: 30, reason: 'MC' } })).status, 200)
  assert.equal((await request('/api/orders', { method: 'POST', token: customerToken, body: { ...orderBody, scheduleId: closeDate, requestId: randomUUID() } })).status, 409)
  assert.equal((await request(`/api/orders/${pending.data.token}`, { method: 'PATCH', token: customerToken, body: { action: 'receipt', receiptId: closeReceipt.id } })).status, 409)
  assert.equal((await request(`/api/orders/${pending.data.token}`)).data.status, 'rejected')
  const closedCatalog = (await request('/api/catalog')).data
  assert.equal(closedCatalog.days.some(row => row.id === closeDate), false)
  assert.equal(closedCatalog.days.some(row => row.closedReason), false, 'Medical/leave reasons remain private')
  run(['prisma', 'db', 'seed', '--', '--schedules-only'])
  assert.equal((await request('/api/catalog')).data.days.some(row => row.id === closeDate), false)
  const removeDate = catalog.data.drops[3].id
  assert.equal((await request(`/api/admin/schedules/${removeDate}`, { method: 'DELETE', token: adminKey })).status, 200)
  run(['prisma', 'db', 'seed', '--', '--schedules-only'])
  assert.equal((await request('/api/orders', { method: 'POST', token: customerToken, body: { ...orderBody, scheduleId: removeDate, requestId: randomUUID() } })).status, 409)
  assert.equal((await request(`/api/admin/schedules/${removeDate}`, { method: 'PUT', token: adminKey, body: { open: true, capacity: 30 } })).status, 200)
  // Weekends stay hidden and unavailable to public checkout even if opened by admin.
  const weekend = new Date(`${scheduleId}T00:00:00Z`)
  while (weekend.getUTCDay() !== 6) weekend.setUTCDate(weekend.getUTCDate() + 1)
  const weekendId = weekend.toISOString().slice(0, 10)
  assert.equal((await request(`/api/admin/schedules/${weekendId}`, { method: 'PUT', token: adminKey, body: { open: true, capacity: 10 } })).status, 200)
  assert.equal((await request('/api/orders', { method: 'POST', token: customerToken, body: { ...orderBody, scheduleId: weekendId, requestId: randomUUID() } })).status, 400)
  const attemptedBrowse = await request('/api/catalog?month=2027-01')
  assert.deepEqual(attemptedBrowse.data.days.map(row => row.id), (await request('/api/catalog')).data.days.map(row => row.id), 'Month queries cannot expose dates outside the active week')
  assert.ok(attemptedBrowse.data.days.length <= 5)
  assert.ok(attemptedBrowse.data.days.every(day => { const weekday = new Date(`${day.id}T00:00:00Z`).getUTCDay(); return weekday >= 1 && weekday <= 5 && day.open }))
  assert.equal(attemptedBrowse.data.days.some(day => day.id === weekendId), false)
  const fridayId = catalog.data.week.days[4]
  assert.equal(attemptedBrowse.data.days.some(day => day.id === fridayId), false)
  assert.equal((await request(`/api/admin/schedules/${fridayId}`, { method: 'PUT', token: adminKey, body: { open: true, capacity: 11 } })).status, 200)
  assert.equal((await request('/api/catalog')).data.days.some(day => day.id === fridayId), true, 'Friday appears only when active in the calendar')
  const outsideWeek = new Date(`${catalog.data.week.end}T00:00:00Z`); outsideWeek.setUTCDate(outsideWeek.getUTCDate() + 1)
  const outsideId = outsideWeek.toISOString().slice(0, 10)
  await database.query('INSERT INTO schedules(id,capacity,open) VALUES ($1,30,true) ON CONFLICT (id) DO UPDATE SET open = true', [outsideId])
  assert.equal((await request('/api/orders', { method: 'POST', token: customerToken, body: { ...orderBody, scheduleId: outsideId, requestId: randomUUID() } })).status, 400, 'Even an open date outside the active week cannot accept checkout')
  console.log('PASS: cross-date stock race, separate bottle sizes, stock correction guards, reservation expiry, variety snapshots, closed-day checkout and receipt guards, durable removals, explicit reopening, optional Fridays and weekend exclusion.')

  // Start a fresh test process so browser checks have their own rate-limit window.
  const previousServer = server
  const exited = new Promise(resolve => previousServer.once('exit', resolve))
  previousServer.kill('SIGTERM')
  await Promise.race([exited, delay(3000).then(() => { if (previousServer.exitCode === null && previousServer.signalCode === null) previousServer.kill('SIGKILL') })])
  await exited
  server = spawn(process.execPath, ['.output/server/index.mjs'], { env, stdio: ['ignore', 'pipe', 'pipe'] })
  server.stdout.on('data', chunk => { serverOutput += chunk })
  server.stderr.on('data', chunk => { serverOutput += chunk })
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(`${base}/api/health`)).ok) break } catch {}
    await delay(100)
  }
  // Manual sales reserve real inventory even when unpaid and have independent payment tracking.
  const manualDate = '2026-10-25'
  const manualBody = { requestId: randomUUID(), scheduleId: manualDate, name: 'Offline Customer', phone: '', varietyId: 'tebu-1', paymentStatus: 'unpaid', cart: { flask: 1, jug: 0, asam: 0, limau: 0 } }
  assert.equal((await request('/api/admin/orders', { method: 'POST', body: manualBody })).status, 401)
  const beforeManual = (await request('/api/catalog')).data.varieties.find(v => v.id === 'tebu-1')
  const beforeRevenue = (await request('/api/admin/logs', { token: adminKey })).data.revenue
  const manual = await request('/api/admin/orders', { method: 'POST', token: adminKey, body: manualBody })
  assert.equal(manual.status, 200); assert.equal(manual.data.manualPaymentStatus, 'unpaid'); assert.equal(manual.data.phone, '')
  assert.equal((await request('/api/admin/orders', { method: 'POST', token: adminKey, body: manualBody })).data.token, manual.data.token)
  assert.equal((await request('/api/catalog')).data.varieties.find(v => v.id === 'tebu-1').flaskRemaining, beforeManual.flaskRemaining - 1)
  assert.equal((await request('/api/admin/logs', { token: adminKey })).data.revenue, beforeRevenue)
  const manualSchedule = (await database.query('SELECT * FROM schedules WHERE id = $1', [manualDate])).rows[0]
  assert.equal(manualSchedule.capacity, 11); assert.equal(manualSchedule.flask_capacity, 8); assert.equal(manualSchedule.jug_capacity, 3); assert.equal(manualSchedule.open, false)
  assert.equal((await request('/api/admin', { method: 'PATCH', token: adminKey, body: { action: 'manual-payment', orderToken: manual.data.token, paymentStatus: 'paid' } })).status, 200)
  assert.equal((await request('/api/admin/logs', { token: adminKey })).data.revenue, beforeRevenue + manual.data.total)
  assert.equal((await request('/api/admin', { method: 'PATCH', token: adminKey, body: { action: 'manual-payment', orderToken: manual.data.token, paymentStatus: 'unpaid' } })).status, 200)
  assert.equal((await request('/api/admin/logs', { token: adminKey })).data.revenue, beforeRevenue)
  const overflow = await request('/api/admin/orders', { method: 'POST', token: adminKey, body: { ...manualBody, requestId: randomUUID(), cart: { flask: 0, jug: 4, asam: 0, limau: 0 } } })
  assert.equal(overflow.status, 409, 'Manual orders enforce big bottle daily limits')
  assert.equal((await request('/api/admin', { method: 'PATCH', token: adminKey, body: { action: 'cancel-manual', orderToken: manual.data.token } })).status, 200)
  assert.equal((await request('/api/catalog')).data.varieties.find(v => v.id === 'tebu-1').flaskRemaining, beforeManual.flaskRemaining)
  assert.equal((await request('/api/admin', { method: 'PATCH', token: adminKey, body: { action: 'manual-payment', orderToken: manual.data.token, paymentStatus: 'paid' } })).status, 409)
  await database.query('UPDATE schedules SET flask_capacity = 1 WHERE id = $1', [manualDate])
  const manualRace = await Promise.all([0, 1].map(() => request('/api/admin/orders', { method: 'POST', token: adminKey, body: { ...manualBody, requestId: randomUUID() } })))
  assert.deepEqual(manualRace.map(row => row.status).sort(), [200, 409], 'Concurrent manual orders cannot exceed a bottle size limit')
  await request('/api/admin', { method: 'PATCH', token: adminKey, body: { action: 'cancel-manual', orderToken: manualRace.find(row => row.status === 200).data.token } })
  console.log('PASS: manual orders persist, retry safely, reserve stock while unpaid, track paid revenue, enforce size limits and release stock on cancellation.')

  const checklistToday = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kuala_Lumpur', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
  const todayOrder = await request('/api/admin/orders', { method: 'POST', token: adminKey, body: { ...manualBody, requestId: randomUUID(), scheduleId: checklistToday, name: 'Today packing customer', paymentStatus: 'paid' } })
  assert.equal(todayOrder.status, 200)

  browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const page = await context.newPage()
  debugPage = page
  page.setDefaultTimeout(10000)
  page.on('response', async response => { if (response.status() >= 400 && response.url().includes('/api/')) console.error('Failed API request:', response.status(), response.url(), await response.text()) })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(base)
  await page.getByRole('button', { name: 'Add The Everyday Flask', exact: true }).waitFor()
  await page.goto(`${base}/admin/log`)
  await page.getByLabel('Admin key').fill(adminKey)
  await page.getByRole('button', { name: 'Open pantry ops' }).click()
  await page.getByTestId('revenue-total').waitFor()
  await page.getByRole('button', { name: 'Add expense', exact: true }).click()
  await page.getByLabel('Amount (RM)').fill('18.75')
  await page.getByLabel('Note optional').fill('Browser database test')
  assert.equal(await page.getByLabel('Drop optional').count(), 0)
  await page.getByRole('dialog').getByRole('button', { name: 'Add expense', exact: true }).click()
  await page.getByRole('cell').filter({ hasText: 'Browser database test' }).waitFor()
  assert.equal(Number((await database.query("SELECT amount FROM expenses WHERE note = 'Browser database test'")).rows[0].amount), 1875)
  const stockBefore = (await request('/api/catalog')).data.varieties.find(row => row.id === 'tebu-1').flaskQty
  await page.getByRole('button', { name: 'Log harvest', exact: true }).click()
  assert.equal(await page.getByLabel('Drop optional').count(), 0)
  await page.getByLabel('Tebu variety', { exact: true }).selectOption('tebu-1')
  await page.getByLabel('Ready 500 ml bottles', { exact: true }).fill('7')
  await page.getByLabel('Ready 1 litre bottles', { exact: true }).fill('3')
  await page.getByRole('dialog').getByRole('button', { name: 'Log harvest', exact: true }).click()
  await page.getByRole('dialog').waitFor({ state: 'hidden' })
  assert.equal((await request('/api/catalog')).data.varieties.find(row => row.id === 'tebu-1').flaskQty, stockBefore + 7)
  const context2 = await browser.newContext()
  const page2 = await context2.newPage()
  debugPage = page2
  page2.setDefaultTimeout(10000)
  await page2.goto(`${base}/admin/log`)
  await page2.getByLabel('Admin key').fill(adminKey)
  await page2.getByRole('button', { name: 'Open pantry ops' }).click()
  await page2.getByRole('cell').filter({ hasText: 'Browser database test' }).waitFor()
  await page2.reload()
  await page2.getByLabel('Admin key').fill(adminKey)
  await page2.getByRole('button', { name: 'Open pantry ops' }).click()
  await page2.getByRole('cell').filter({ hasText: 'Browser database test' }).waitFor()
  await page.getByRole('link', { name: 'Calendar', exact: true }).click()
  await page.locator('.admin-drop-picker').waitFor()
  await page.locator(`.calendar-date[data-date="${removeDate}"]`).click()
  await page.getByLabel('Day status', { exact: true }).selectOption('AL')
  await page.getByRole('button', { name: 'Save day', exact: true }).click()
  await page.getByRole('status').filter({ hasText: 'Calendar saved.' }).waitFor()
  await page2.goto(base)
  await page2.getByRole('button', { name: /Tebu Madu Test/ }).waitFor()
  assert.equal(await page2.locator(`.week-date[data-date="${removeDate}"]`).count(), 0)
  for (const width of [320, 390, 1440]) {
    await page2.setViewportSize({ width, height: 900 })
    assert.equal(await page2.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `Calendar overflow at ${width}`)
  }
  await page2.screenshot({ path: 'test-results/tebu-public-calendar.png', fullPage: true })
  await page.screenshot({ path: 'test-results/tebu-admin-calendar.png', fullPage: true })
  await page.getByRole('button', { name: 'Add order', exact: true }).click()
  await page.getByLabel('Customer name', { exact: true }).fill('Browser offline sale')
  await page.getByLabel('Order date', { exact: true }).fill(removeDate)
  await page.getByLabel('The Everyday Flask (500 ml)').fill('1')
  await page.getByLabel('Payment status', { exact: true }).selectOption('paid')
  await page.getByRole('button', { name: 'Save order', exact: true }).click()
  await page.getByRole('dialog').waitFor({ state: 'hidden' })
  const manualCard = page.locator('.manual-orders .review-card').filter({ hasText: 'Browser offline sale' })
  await manualCard.waitFor()
  const savedManual = (await database.query("SELECT manual_payment_status, total FROM orders WHERE customer_name = 'Browser offline sale'")).rows[0]
  assert.equal(savedManual.manual_payment_status, 'paid'); assert.equal(savedManual.total, 600)
  await manualCard.getByRole('button', { name: 'Mark unpaid', exact: true }).click()
  await manualCard.getByRole('button', { name: 'Mark paid', exact: true }).waitFor()
  await manualCard.getByRole('button', { name: 'Cancel order', exact: true }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Cancel order', exact: true }).click()
  await manualCard.getByText('Cancelled', { exact: true }).waitFor()
  await page.screenshot({ path: 'test-results/tebu-manual-orders.png', fullPage: true })
  await page.getByRole('link', { name: 'Checklist', exact: true }).click()
  await page.locator('.checklist-day').waitFor()
  assert.equal(await page.locator('.checklist-day').getAttribute('data-date'), checklistToday)
  assert.equal(await page.locator('.admin-drop-picker, .manual-orders').count(), 0)
  assert.equal(await page.locator('.admin-bottom-nav a').count(), 3)
  const todayBag = page.locator('.packing-row').filter({ hasText: 'Today packing customer' })
  await todayBag.waitFor()
  assert.equal(await page.locator('.packing-row').filter({ hasText: 'Browser offline sale' }).count(), 0)
  await todayBag.getByRole('checkbox').check()
  await page.getByRole('button', { name: '2. Pantry drop', exact: true }).click()
  await page.locator('.collection-row').filter({ hasText: 'Today packing customer' }).waitFor()
  assert.equal(await page.locator('.collection-row').filter({ hasText: 'Browser offline sale' }).count(), 0)
  assert.equal((await database.query('SELECT packed FROM orders WHERE token = $1', [todayOrder.data.token])).rows[0].packed, true)
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `Checklist overflow at ${width}`)
  }
  await page.screenshot({ path: 'test-results/tebu-checklist-today.png', fullPage: true })
  assert.deepEqual(errors, [])
  console.log('PASS: fresh migrations; repeatable seeds; database constraints; log CRUD, validation and import; catalog pricing; customer history; receipts, approval, packing, drop and collection; concurrent capacity; browser login and persistence across reloads and separate browsers.')
} catch (error) {
  if (debugPage) {
    console.error('Browser alerts:', await debugPage.locator('[role=alert]').allTextContents())
    await debugPage.screenshot({ path: 'test-results/database-failure.png', fullPage: true }).catch(() => {})
  }
  throw error
} finally {
  await browser?.close()
  if (server && server.exitCode === null && server.signalCode === null) {
    const exited = new Promise(resolve => server.once('exit', resolve))
    server.kill('SIGTERM')
    await Promise.race([exited, delay(3000).then(() => { if (server.exitCode === null && server.signalCode === null) server.kill('SIGKILL') })])
    await exited
  }
  await database.end().catch(() => {})
  if (created) {
    await root.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1', [databaseName])
    await root.query(`DROP DATABASE "${databaseName}"`)
  }
  await root.end().catch(() => {})
  await rm(uploads, { recursive: true, force: true })
}
