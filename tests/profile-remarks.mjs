import 'dotenv/config'
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import { setTimeout as delay } from 'node:timers/promises'
import pg from 'pg'
import sharp from 'sharp'
import { chromium } from 'playwright'

const name = `tebu_profile_test_${Date.now()}_${randomBytes(3).toString('hex')}`
const url = new URL(process.env.NUXT_DATABASE_URL); url.pathname = `/${name}`
const root = new pg.Client({ connectionString: process.env.NUXT_DATABASE_URL })
const sql = new pg.Client({ connectionString: url.toString() })
const key = randomBytes(32).toString('hex'), base = 'http://127.0.0.1:3055'
const env = { ...process.env, NUXT_DATABASE_URL: url.toString(), NUXT_ADMIN_KEY: key, NUXT_PUBLIC_DEMO: 'false', NUXT_PUBLIC_TESTING_CALENDAR: 'true', NUXT_UPLOAD_STORAGE: 'local', NUXT_UPLOAD_DIR: `/tmp/${name}`, NUXT_PUBLIC_DUITNOW_QR: '/favicon.svg', NITRO_HOST: '127.0.0.1', NITRO_PORT: '3055', NODE_ENV: 'development' }
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kuala_Lumpur', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
const password = 'profile-test-password', publicPhone = '0129990051', privatePhone = '0129990052', unknownPhone = '0129990053'
const quantities = { kecik: 1, besar: 0, asam: 0, limau: 0 }
const request = async (path, { cookie, token, body, ...options } = {}) => {
  const response = await fetch(base + path, { ...options, ...(body ? { method: options.method || 'POST', body: JSON.stringify(body) } : {}), headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) } })
  return { status: response.status, data: await response.json(), cookie: response.headers.get('set-cookie') || '' }
}
const orderBody = extra => ({ requestId: randomUUID(), scheduleId: today, varietyId: 'tebu-1', cart: quantities, ...extra })
let server, browser, debugPage, created = false, output = ''
try {
  await root.connect(); await root.query(`CREATE DATABASE "${name}"`); created = true
  const migration = spawnSync('bun', ['prisma', 'migrate', 'deploy'], { env, encoding: 'utf8' }); assert.equal(migration.status, 0, migration.stderr)
  await sql.connect()
  await sql.query("INSERT INTO schedules(id) SELECT to_char(day, 'YYYY-MM-DD') FROM generate_series($1::date, $1::date + 4, interval '1 day') AS day", [today])
  await sql.query("INSERT INTO harvests(date,quantity,type,variety_id,kecik_qty,besar_qty) SELECT $1::date,1,name,id,100,100 FROM cane_varieties", [today])
  server = spawn(process.execPath, ['.output/server/index.mjs'], { env, stdio: ['ignore', 'pipe', 'pipe'] })
  server.stdout.on('data', chunk => { output += chunk }); server.stderr.on('data', chunk => { output += chunk })
  let ready = false
  for (let attempt = 0; attempt < 100; attempt++) { try { if ((await fetch(base + '/api/health')).ok) { ready = true; break } } catch {} await delay(100) }
  assert.ok(ready, output)
  const publicProfile = await request('/api/identity', { body: { phone: publicPhone, name: 'Open Profile' } }); assert.equal(publicProfile.status, 200)
  const privateProfile = await request('/api/identity', { body: { phone: privatePhone, name: 'Private Profile', protectHistory: true, password } }); assert.equal(privateProfile.status, 200)
  const lookup = (phone, cookie) => request('/api/identity/lookup', { body: { phone }, cookie })
  const countBefore = (await sql.query('SELECT (SELECT count(*)::int FROM customers) AS customers,(SELECT count(*)::int FROM customer_sessions) AS sessions')).rows[0]
  assert.deepEqual((await lookup(unknownPhone)).data, { found: false, passwordRequired: false })
  assert.equal((await lookup(publicPhone)).data.name, 'Open Profile')
  const locked = await lookup(privatePhone); assert.equal(locked.data.passwordRequired, true); assert.equal(locked.data.name, undefined); assert.equal(locked.cookie, '')
  assert.equal((await lookup(privatePhone, publicProfile.cookie.split(';')[0])).data.name, undefined, 'Another customer session cannot reveal this name')
  assert.deepEqual((await sql.query('SELECT (SELECT count(*)::int FROM customers) AS customers,(SELECT count(*)::int FROM customer_sessions) AS sessions')).rows[0], countBefore, 'Lookup creates neither customers nor sessions')
  assert.equal((await lookup(privatePhone, privateProfile.cookie.split(';')[0])).data.name, 'Private Profile')
  const expiry = (await sql.query('SELECT expires_at FROM customer_sessions WHERE token_hash=$1', [createHash('sha256').update(privateProfile.data.token).digest('hex')])).rows[0].expires_at
  await lookup(privatePhone, privateProfile.cookie.split(';')[0])
  assert.deepEqual((await sql.query('SELECT expires_at FROM customer_sessions WHERE token_hash=$1', [createHash('sha256').update(privateProfile.data.token).digest('hex')])).rows[0].expires_at, expiry)
  await sql.query("UPDATE customer_sessions SET expires_at=now()-interval '1 minute' WHERE token_hash=$1", [createHash('sha256').update(privateProfile.data.token).digest('hex')])
  const expiredLookup = await lookup(privatePhone, privateProfile.cookie.split(';')[0])
  assert.equal(expiredLookup.data.passwordRequired, true); assert.equal(expiredLookup.data.name, undefined)
  console.log('PASS: read-only profile lookup, password privacy, matching sessions and fixed expiry')

  const remarks = 'Keep the bags together.\nName on bag: <b>Team A</b>'
  const createdOrder = await request('/api/orders', { token: publicProfile.data.token, body: orderBody({ name: 'Bag Name', remarks: `  ${remarks}  ` }) }); assert.equal(createdOrder.status, 200)
  assert.equal(createdOrder.data.remarks, remarks); assert.equal(createdOrder.data.name, 'Bag Name')
  assert.equal((await request(`/api/orders/${createdOrder.data.token}`)).data.remarks, remarks)
  assert.equal((await request('/api/orders', { token: publicProfile.data.token })).data.orders[0].remarks, remarks)
  const stored = (await sql.query('SELECT remarks,customer_name FROM orders WHERE token=$1', [createdOrder.data.token])).rows[0]
  assert.deepEqual(stored, { remarks, customer_name: 'Bag Name' })
  for (const invalid of ['x'.repeat(501), 123, { text: 'bad' }]) assert.equal((await request('/api/orders', { token: publicProfile.data.token, body: orderBody({ remarks: invalid }) })).status, 400)
  const fullLength = await request('/api/orders', { token: publicProfile.data.token, body: orderBody({ remarks: 'x'.repeat(500) }) }); assert.equal(fullLength.status, 200)
  const blank = await request('/api/orders', { token: publicProfile.data.token, body: orderBody({ remarks: ' \n ' }) }); assert.equal(blank.status, 200); assert.equal(blank.data.remarks, undefined)
  const omitted = await request('/api/orders', { token: publicProfile.data.token, body: orderBody() }); assert.equal(omitted.status, 200); assert.equal(omitted.data.remarks, undefined)
  const manualBody = { ...orderBody(), name: 'Manual Remarks', phone: '', paymentStatus: 'paid', remarks }
  const manual = await request('/api/admin/orders', { token: key, body: manualBody }); assert.equal(manual.status, 200)
  const edit = { name: manualBody.name, scheduleId: today, varietyId: 'tebu-1', status: 'confirmed', paymentStatus: 'paid', cart: quantities }
  assert.equal((await request(`/api/admin/orders/${manual.data.token}`, { token: key, method: 'PATCH', body: edit })).data.order.remarks, remarks, 'Older edit clients preserve omitted remarks')
  assert.equal((await request(`/api/admin/orders/${manual.data.token}`, { token: key, method: 'PATCH', body: { ...edit, remarks: 'x'.repeat(501) } })).status, 400)
  assert.equal((await request(`/api/admin/orders/${manual.data.token}`, { token: key, method: 'PATCH', body: { ...edit, remarks: '' } })).data.order.remarks, undefined)
  assert.equal((await request(`/api/admin/orders/${manual.data.token}`, { token: key, method: 'PATCH', body: { ...edit, remarks } })).data.order.remarks, remarks)
  assert.equal((await request('/api/admin/orders?search=Team%20A', { token: key })).data.total, 2)
  await assert.rejects(sql.query('UPDATE orders SET remarks=$1 WHERE token=$2', ['x'.repeat(501), manual.data.token]), error => error.code === '23514')
  console.log('PASS: public/manual remarks, multiline text, 500-character limits, empty values, edit preservation/clearing, history and search')

  browser = await chromium.launch({ headless: true }); await mkdir('test-results', { recursive: true })
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, extraHTTPHeaders: { 'X-Forwarded-For': '127.0.0.21' } })
  const page = await context.newPage(); debugPage = page; page.setDefaultTimeout(12000)
  const errors = []; page.on('pageerror', error => errors.push(error.message))
  await page.goto(base, { waitUntil: 'networkidle' })
  await page.evaluate(phone => { localStorage.setItem('customer_phone', phone); localStorage.setItem('customer_name', 'STALE LOCAL NAME') }, privatePhone)
  await page.reload({ waitUntil: 'networkidle' })
  await page.getByRole('button', { name: 'Add Botol Kecik', exact: true }).click()
  await page.getByRole('button', { name: 'LOCK MY BOTTLE', exact: true }).click()
  await page.getByLabel('History password', { exact: true }).waitFor()
  assert.equal(await page.getByLabel('What should we write on your bag?', { exact: true }).count(), 0, 'Protected names are hidden until verification even with stale local storage')
  assert.ok(!(await page.locator('.checkout-drawer').innerText()).includes('STALE LOCAL NAME'))
  assert.ok(!(await page.locator('body').innerText()).includes('Could not refresh your past orders.'))
  const beforeUnlock = (await sql.query('SELECT count(*)::int AS count FROM orders')).rows[0].count
  await page.getByLabel('History password', { exact: true }).fill('incorrect-password')
  await page.getByRole('button', { name: 'Unlock profile', exact: true }).click()
  await page.getByText('Incorrect history password.', { exact: true }).waitFor()
  await page.getByLabel('History password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Unlock profile', exact: true }).click()
  const bagName = page.getByLabel('What should we write on your bag?', { exact: true }); await bagName.waitFor()
  assert.equal(await bagName.inputValue(), 'Private Profile')
  assert.equal((await sql.query('SELECT count(*)::int AS count FROM orders')).rows[0].count, beforeUnlock, 'Unlocking does not start an order')
  await bagName.fill('Private Bag Name')
  await page.getByLabel('Remarks (optional)', { exact: true }).fill(remarks)
  await page.locator('.checkout-drawer').screenshot({ path: 'test-results/profile-remarks-checkout-390.png' })
  await page.getByRole('button', { name: 'Continue to payment', exact: true }).click()
  await page.getByRole('heading', { name: 'Pay with DuitNow QR', exact: true }).waitFor()
  const privateOrder = (await sql.query("SELECT token,remarks,customer_name FROM orders WHERE customer_name='Private Bag Name'")).rows[0]
  assert.equal(privateOrder.remarks, remarks)
  await page.getByRole('button', { name: 'I’ve paid — upload receipt', exact: true }).click()
  const image = await sharp({ create: { width: 200, height: 200, channels: 3, background: '#eee' } }).png().toBuffer()
  await page.getByLabel('Payment receipt', { exact: true }).setInputFiles({ name: 'receipt.png', mimeType: 'image/png', buffer: image })
  await page.getByRole('button', { name: 'Submit my receipt', exact: true }).click()
  await page.getByRole('heading', { name: 'Your order receipt is ready', exact: true }).waitFor()
  await page.getByRole('button', { name: 'Close checkout', exact: true }).click()
  await page.getByRole('button', { name: 'Add Botol Kecik', exact: true }).click()
  await page.getByRole('button', { name: 'LOCK MY BOTTLE', exact: true }).click()
  await page.waitForFunction(() => document.querySelector('#name')?.value === 'Private Profile')
  assert.equal(await page.getByLabel('History password', { exact: true }).count(), 0, 'The valid cookie unlocks autofill without another password')
  assert.equal(await page.getByLabel('Remarks (optional)', { exact: true }).inputValue(), '', 'New orders do not inherit previous remarks')
  const sessionCookie = (await context.cookies()).find(cookie => cookie.name === 'tebu_customer_session'); assert.ok(sessionCookie.httpOnly)
  assert.equal(await page.evaluate(() => localStorage.getItem('customer_token')), null)
  assert.equal(await page.evaluate(secret => JSON.stringify(localStorage).includes(secret), password), false)

  // A slow result for a previous phone must not overwrite the current profile.
  let release, requested
  const started = new Promise(resolve => { requested = resolve })
  const gate = new Promise(resolve => { release = resolve })
  await page.route('**/api/identity/lookup', async route => {
    if (route.request().postDataJSON().phone === '60129990051') { requested(); await gate }
    await route.continue()
  })
  await page.getByLabel('Malaysian mobile number').fill(publicPhone); await started
  await page.getByLabel('Malaysian mobile number').fill(unknownPhone)
  await page.getByText('New number. Enter your name to save your profile.', { exact: true }).waitFor()
  release(); await page.unrouteAll({ behavior: 'wait' })
  await delay(100)
  assert.equal(await bagName.inputValue(), '')
  await page.getByLabel('Malaysian mobile number').fill(publicPhone)
  await page.waitForFunction(() => document.querySelector('#name')?.value === 'Open Profile')
  console.log('PASS browser: protected/unprotected autofill, password errors and unlock, cookie reuse, stale lookup prevention, order-specific remarks and no stored passwords/tokens')
  await page.getByRole('button', { name: 'Close checkout', exact: true }).click()
  await page.goto(base + `/drop?t=${privateOrder.token}`, { waitUntil: 'networkidle' })
  assert.equal(await page.locator('.order-remarks p').innerText(), remarks)
  assert.equal(await page.locator('.order-remarks b').count(), 0, 'Remarks are text, never interpreted as HTML')
  await page.locator('.ticket-card').screenshot({ path: 'test-results/profile-remarks-ticket-390.png' })
  await page.goto(base + '/drop', { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: 'Lock history', exact: true }).waitFor()
  assert.equal(await page.locator('.transaction-table .order-remarks p').innerText(), remarks)
  assert.deepEqual(errors, [])

  const admin = await browser.newPage({ viewport: { width: 1440, height: 1000 }, extraHTTPHeaders: { 'X-Forwarded-For': '127.0.0.22' } }); debugPage = admin; admin.setDefaultTimeout(12000)
  await admin.goto(base + '/admin', { waitUntil: 'networkidle' }); await admin.getByLabel('Admin key', { exact: true }).fill(key); await admin.getByRole('button', { name: 'Open pantry ops' }).click()
  assert.equal(await admin.locator(`.packing-row[data-token="${manual.data.token}"] .order-remarks p`).innerText(), remarks)
  await admin.getByRole('link', { name: 'Calendar', exact: true }).click()
  const row = admin.locator(`.transaction-row[data-token="${privateOrder.token}"]`); await row.waitFor()
  assert.equal(await row.locator('.order-remarks p').innerText(), remarks)
  await row.locator('.transaction-open').click()
  const dialog = admin.getByRole('dialog'); assert.equal(await dialog.locator('.order-remarks p').innerText(), remarks)
  await dialog.getByRole('button', { name: 'Edit transaction', exact: true }).click()
  const editedRemarks = 'Updated by admin\nKeep chilled.'
  await admin.getByLabel('Remarks (optional)', { exact: true }).fill(editedRemarks)
  await admin.getByRole('button', { name: 'Save changes', exact: true }).click()
  await admin.waitForFunction(({ token, text }) => document.querySelector(`.transaction-row[data-token="${token}"] .order-remarks p`)?.textContent === text, { token: privateOrder.token, text: editedRemarks })
  await admin.locator('.ops-transactions-table').screenshot({ path: 'test-results/profile-remarks-admin-1440.png' })
  assert.equal((await request(`/api/orders/${privateOrder.token}`)).data.remarks, editedRemarks)
  await admin.getByRole('button', { name: 'Add order', exact: true }).click()
  await admin.locator('#manual-name').fill('Manual UI Remarks')
  await admin.locator('#manual-date').fill(today)
  await admin.locator('#manual-kecik').fill('1')
  await admin.locator('#manual-remarks').fill('Manual form remark')
  await admin.getByRole('button', { name: 'Save order', exact: true }).click()
  await admin.getByRole('dialog').waitFor({ state: 'hidden' })
  assert.equal((await sql.query("SELECT remarks FROM orders WHERE customer_name='Manual UI Remarks'")).rows[0].remarks, 'Manual form remark')
  await admin.getByRole('button', { name: 'Add order', exact: true }).click()
  assert.equal(await admin.locator('#manual-remarks').inputValue(), '')
  await admin.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click()
  console.log('PASS UI: literal multiline remarks in customer tickets/history, admin table/details/editing and packing list')
} catch (error) {
  if (debugPage && !debugPage.isClosed()) await debugPage.screenshot({ path: 'test-results/profile-remarks-failure.png', fullPage: true }).catch(() => {})
  throw error
} finally {
  await browser?.close()
  if (server && server.exitCode === null && server.signalCode === null) { const exit = new Promise(resolve => server.once('exit', resolve)); server.kill('SIGTERM'); await exit }
  await sql.end().catch(() => {})
  if (created) await root.query(`DROP DATABASE "${name}" WITH (FORCE)`)
  await root.end()
  const { rm } = await import('node:fs/promises'); await rm(env.NUXT_UPLOAD_DIR, { recursive: true, force: true })
}
