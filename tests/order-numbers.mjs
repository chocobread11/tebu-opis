import './helpers/disable-telegram.mjs'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { randomBytes, randomUUID } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { setTimeout as delay } from 'node:timers/promises'
import pg from 'pg'

const name = `tebu_numbers_test_${Date.now()}`
const url = new URL(process.env.NUXT_DATABASE_URL); url.pathname = `/${name}`
const root = new pg.Client({ connectionString: process.env.NUXT_DATABASE_URL })
const sql = new pg.Client({ connectionString: url.toString() })
const key = randomBytes(32).toString('hex'), base = 'http://127.0.0.1:3067'
const env = { ...process.env, NUXT_DATABASE_URL: url.toString(), NUXT_ADMIN_KEY: key, NUXT_PUBLIC_DEMO: 'false', NUXT_PUBLIC_TESTING_CALENDAR: 'true', NUXT_PUBLIC_DUITNOW_QR: '/favicon.svg', NITRO_HOST: '127.0.0.1', NITRO_PORT: '3067' }
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kuala_Lumpur', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
const dates = Array.from({ length: 3 }, (_, i) => { const d = new Date(`${today}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + i); return d.toISOString().slice(0, 10) })
let server, created = false, output = ''
async function start() {
  server = spawn(process.execPath, ['.output/server/index.mjs'], { env, stdio: ['ignore', 'pipe', 'pipe'] })
  server.stdout.on('data', b => output += b); server.stderr.on('data', b => output += b)
  for (let i = 0; i < 100; i++) { try { if ((await fetch(base + '/api/health')).ok) return } catch {} await delay(100) }
  throw new Error(output)
}
async function stop() { if (server && server.exitCode === null) { const exited = new Promise(resolve => server.once('exit', resolve)); server.kill('SIGTERM'); await exited } }
async function call(path, { token = key, body, method = body ? 'POST' : 'GET' } = {}) {
  const r = await fetch(base + path, { method, headers: { 'X-Forwarded-For': '127.0.0.67', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined })
  const data = await r.json(); assert.equal(r.status, 200, JSON.stringify(data)); return data
}
const number = order => Number(order.tag.slice(2))
try {
  await root.connect(); await root.query(`CREATE DATABASE "${name}"`); created = true; await sql.connect()
  const last = '202611190001_global_order_numbers'
  const migrations = (await readdir('prisma/migrations')).filter(n => n !== 'migration_lock.toml').sort()
  assert.equal(migrations.at(-1), last)
  for (const migration of migrations.filter(n => n !== last)) await sql.query(await readFile(`prisma/migrations/${migration}/migration.sql`, 'utf8'))
  for (const date of dates) await sql.query('INSERT INTO schedules(id,capacity) VALUES($1,100)', [date])
  const customer = (await sql.query("INSERT INTO customers(name,token_hash) VALUES('Historical buyer','historical-number-fixture') RETURNING id")).rows[0].id
  for (const [i, date] of dates.entries()) await sql.query("INSERT INTO orders(token,request_id,customer_id,schedule_id,sequence,tag,cart,bottles,total,status,expires_at) VALUES($1,gen_random_uuid(),$2,$3,1,$4,'{\"kecik\":1}',1,600,'rejected',now())", [`historical-${i}`, customer, date, i === 2 ? '#A100' : '#A09'])
  await sql.query('INSERT INTO audit_events(entity_type,entity_id,action,"before") VALUES(\'order\',\'deleted-fixture\',\'deleted\',\'{"tag":"#A119"}\')')
  const before = (await sql.query('SELECT id,tag FROM orders ORDER BY id')).rows
  await sql.query(await readFile(`prisma/migrations/${last}/migration.sql`, 'utf8'))
  assert.deepEqual((await sql.query('SELECT id,tag FROM orders ORDER BY id')).rows, before, 'Issued references, including old repeats, must stay unchanged')
  await sql.query("INSERT INTO stock_entries(product_id,date,quantity,note) VALUES('kecik',$1,100,'Numbering fixture')", [today])
  await start()
  const identity = await call('/api/identity', { token: '', body: { phone: '0129990067', name: 'Numbering buyer' } })
  const buy = (scheduleId, requestId = randomUUID()) => call('/api/orders', { token: identity.token, body: { requestId, scheduleId, cart: { kecik: 1 } } })
  const manual = scheduleId => call('/api/admin/orders', { body: { requestId: randomUUID(), name: 'Manual numbering', scheduleId, paymentStatus: 'unpaid', cart: { kecik: 1 } } })
  const requestId = randomUUID(), first = await buy(dates[0], requestId)
  assert.equal(first.tag, '#A120', 'The counter must include deleted references and support numbers above 99')
  assert.equal((await buy(dates[0], requestId)).token, first.token, 'A checkout retry returns the same order')
  const race = await Promise.all([buy(dates[0]), buy(dates[1]), buy(dates[2]), manual(dates[0]), manual(dates[1]), manual(dates[2])])
  assert.equal(new Set([first, ...race].map(o => o.tag)).size, 7, 'Customer and manual orders across dates must not share references')
  const retryRaceId = randomUUID(), retryRace = await Promise.all([buy(dates[1], retryRaceId), buy(dates[1], retryRaceId)])
  assert.equal(retryRace[0].token, retryRace[1].token); assert.equal(retryRace[0].tag, retryRace[1].tag)
  const moved = await call(`/api/admin/orders/${first.token}`, { method: 'PATCH', body: { name: 'Numbering buyer', scheduleId: dates[1], status: 'pending_payment', cart: { kecik: 1 } } })
  assert.equal(moved.order.tag, first.tag, 'Changing the delivery date keeps the ticket reference')
  const latest = await manual(dates[0]); await call(`/api/admin/orders/${latest.token}`, { method: 'DELETE' })
  const afterDelete = await manual(dates[0]); assert.ok(number(afterDelete) > number(latest), 'Deleting the latest order must not reuse its number')
  await sql.query('BEGIN'); const rolledBack = (await sql.query('SELECT next_order_tag() AS tag')).rows[0]; await sql.query('ROLLBACK')
  await stop(); await start()
  const afterRestart = await buy(dates[2]); assert.ok(number(afterRestart) > number(rolledBack), 'Rollback and server restart must not rewind the counter')
  assert.deepEqual((await sql.query("SELECT id,tag FROM orders WHERE token LIKE 'historical-%' ORDER BY id")).rows, before)
  console.log('PASS: historical and deleted reference migration, concurrent customer/manual orders across dates, retry deduplication, date changes, deletion, rollback, restart and numbers above 99.')
} finally {
  await stop(); await sql.end().catch(() => {})
  if (created) await root.query(`DROP DATABASE "${name}" WITH (FORCE)`)
  await root.end()
}
