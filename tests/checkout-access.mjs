import './helpers/disable-telegram.mjs'
import 'dotenv/config'
import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import { spawn, spawnSync } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import pg from 'pg'
import sharp from 'sharp'

const name = `tebu_checkout_test_${randomBytes(8).toString('hex')}`
const url = new URL(process.env.NUXT_DATABASE_URL); url.pathname = `/${name}`
const root = new pg.Client({ connectionString: process.env.NUXT_DATABASE_URL })
const sql = new pg.Client({ connectionString: url.toString() })
const uploads = await mkdtemp(join(tmpdir(), 'tebu-checkout-'))
const base = 'http://127.0.0.1:3056'
const env = { ...process.env, NUXT_DATABASE_URL: url.toString(), NUXT_PUBLIC_DEMO: 'false', NUXT_PUBLIC_TESTING_CALENDAR: 'true', NUXT_PUBLIC_DUITNOW_QR: '/favicon.svg', NUXT_UPLOAD_STORAGE: 'local', NUXT_UPLOAD_DIR: uploads, NITRO_HOST: '127.0.0.1', NITRO_PORT: '3056', NODE_ENV: 'development' }
const phone = '0129990066', password = 'protected-history-password'
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kuala_Lumpur', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
const request = async (path, { body, cookie, token, ...options } = {}) => {
  const response = await fetch(base + path, { ...options, ...(body ? { method: options.method || 'POST', body: JSON.stringify(body) } : {}), headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) } })
  return { status: response.status, data: await response.json(), cookies: response.headers.getSetCookie() }
}
const cookieOf = (result, name) => result.cookies.find(cookie => cookie.startsWith(name + '='))?.split(';')[0]
const orderBody = extra => ({ requestId: randomUUID(), scheduleId: today, varietyId: 'tebu-1', cart: { kecik: 1, besar: 0, asam: 0, limau: 0 }, ...extra })
let server, created = false, output = ''
try {
  await root.connect(); await root.query(`CREATE DATABASE "${name}"`); created = true
  const migration = spawnSync('bun', ['prisma', 'migrate', 'deploy'], { env, encoding: 'utf8' }); assert.equal(migration.status, 0, migration.stderr)
  await sql.connect()
  await sql.query('INSERT INTO schedules(id) VALUES($1)', [today])
  await sql.query("INSERT INTO stock_entries(product_id,date,quantity,note) SELECT id,$1,100,'Test opening stock' FROM products WHERE kind='bottle'", [today])
  server = spawn(process.execPath, ['.output/server/index.mjs'], { env, stdio: ['ignore', 'pipe', 'pipe'] })
  server.stdout.on('data', chunk => { output += chunk }); server.stderr.on('data', chunk => { output += chunk })
  let ready = false
  for (let attempt = 0; attempt < 100; attempt++) { try { if ((await fetch(base + '/api/health')).ok) { ready = true; break } } catch {} await delay(100) }
  assert.ok(ready, output)
  const login = await request('/api/identity', { body: { phone, name: 'Private original name', protectHistory: true, password } }); assert.equal(login.status, 200)
  const before = (await sql.query('SELECT name,password_hash,token_hash FROM customers WHERE phone=$1', ['60129990066'])).rows[0]
  const oldBody = orderBody()
  const older = await request('/api/orders', { token: login.data.token, body: oldBody }); assert.equal(older.status, 200)
  const checkout = await request('/api/checkout', { body: { phone, name: 'New bag name' } }); assert.equal(checkout.status, 200)
  assert.equal(checkout.data.name, 'New bag name'); assert.equal(checkout.data.historyUnlocked, false)
  const cookie = cookieOf(checkout, 'tebu_checkout_session'); assert.ok(cookie)
  assert.equal(cookieOf(checkout, 'tebu_customer_session'), undefined)
  assert.match(checkout.cookies[0], /HttpOnly/); assert.match(checkout.cookies[0], /SameSite=Lax/)
  assert.deepEqual((await sql.query('SELECT name,password_hash,token_hash FROM customers WHERE phone=$1', ['60129990066'])).rows[0], before)
  assert.equal((await request('/api/orders', { cookie })).status, 401)
  assert.equal((await request('/api/identity/password', { method: 'PUT', cookie, body: { password: null } })).status, 401)
  const lookup = await request('/api/identity/lookup', { cookie, body: { phone } }); assert.equal(lookup.data.name, undefined); assert.equal(lookup.data.passwordRequired, true)
  assert.equal((await request('/api/identity', { cookie, body: { phone, mode: 'history' } })).data.passwordRequired, true)
  assert.equal((await request('/api/orders', { cookie, body: orderBody() })).status, 400, 'Missing bag name must not fall back to the private profile name')
  assert.equal((await request('/api/orders', { cookie, body: { ...oldBody, name: 'New bag name' } })).status, 409, 'Request IDs cannot retrieve historical orders')
  const body = orderBody({ name: 'New bag name', remarks: 'No history password needed.' })
  const order = await request('/api/orders', { cookie, body }); assert.equal(order.status, 200); assert.equal(order.data.name, 'New bag name')
  assert.equal((await request('/api/orders', { cookie, body })).data.token, order.data.token)
  assert.equal((await request(`/api/orders/${older.data.token}/receipt-link`, { cookie, body: {} })).status, 401)
  const otherCheckout = await request('/api/checkout', { body: { phone, name: 'Another device' } })
  const otherCookie = cookieOf(otherCheckout, 'tebu_checkout_session')
  assert.equal((await request(`/api/orders/${order.data.token}/receipt-link`, { cookie: otherCookie, body: {} })).status, 401, 'Same phone on another device is not ownership of this order')
  const link = await request(`/api/orders/${order.data.token}/receipt-link`, { cookie, body: {} }); assert.equal(link.status, 200)
  const signature = new URL(link.data.url).hash.slice(1)
  assert.equal((await request(`/api/orders/${order.data.token}/receipt-upload`, { token: signature })).status, 401, 'Receipt credentials do not become history credentials')
  const phoneRead = await fetch(base + `/api/orders/${order.data.token}/receipt-upload`, { headers: { Authorization: `Receipt ${signature}` } }); assert.ok(phoneRead.ok)
  const image = await sharp({ create: { width: 100, height: 100, channels: 3, background: '#eee' } }).png().toBuffer()
  const upload = async orderToken => {
    const form = new FormData(); form.set('file', new Blob([image], { type: 'image/png' }), 'receipt.png'); form.set('orderToken', orderToken)
    const response = await fetch(base + '/api/uploads', { method: 'POST', headers: { Cookie: cookie }, body: form })
    return { status: response.status, data: await response.json() }
  }
  assert.equal((await upload(older.data.token)).status, 401)
  const uploaded = await upload(order.data.token); assert.equal(uploaded.status, 200)
  const submitted = await request(`/api/orders/${order.data.token}`, { method: 'PATCH', cookie, body: { action: 'receipt', receiptId: uploaded.data.id } }); assert.equal(submitted.status, 200); assert.equal(submitted.data.status, 'pending_review')
  assert.equal((await request('/api/orders', { cookie })).status, 401, 'Submitting a receipt must not unlock history')
  const unprotected = await request('/api/checkout', { body: { phone: '0129990067', name: 'First Order' } }); assert.equal(unprotected.status, 200); assert.ok(cookieOf(unprotected, 'tebu_customer_session'))
  const historyCookie = cookieOf(login, 'tebu_customer_session')
  const resumed = await request('/api/checkout', { cookie: historyCookie, body: { phone, name: 'Remembered bag name' } }); assert.equal(resumed.data.historyUnlocked, true); assert.equal(cookieOf(resumed, 'tebu_customer_session'), undefined, 'Checkout does not renew the history session')
  const switched = await request('/api/checkout', { cookie: cookieOf(unprotected, 'tebu_customer_session'), body: { phone, name: 'Different phone' } }); assert.equal(switched.data.historyUnlocked, false); assert.equal(cookieOf(switched, 'tebu_customer_session'), 'tebu_customer_session=')
  await sql.query("UPDATE checkout_sessions SET expires_at=now()-interval '1 minute'")
  assert.equal((await request('/api/orders', { cookie, body: orderBody({ name: 'Expired checkout' }) })).status, 401)
  console.log('PASS: password-free checkout preserves protected profiles, isolates each device/order, rejects history and password access, uploads its own receipt, supports phone links, preserves history expiry and rejects expired checkout sessions.')
} finally {
  if (server && server.exitCode === null && server.signalCode === null) { const exit = new Promise(resolve => server.once('exit', resolve)); server.kill('SIGTERM'); await exit }
  await sql.end().catch(() => {})
  if (created) await root.query(`DROP DATABASE "${name}" WITH (FORCE)`)
  await root.end(); await rm(uploads, { recursive: true, force: true })
}
