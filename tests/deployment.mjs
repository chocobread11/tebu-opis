import './helpers/disable-telegram.mjs'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { randomBytes, randomUUID } from 'node:crypto'
import { createServer as httpServer, request as proxyRequest } from 'node:http'
import { createServer as httpsServer } from 'node:https'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import pg from 'pg'
import sharp from 'sharp'
import { request } from 'playwright'
import { createBackup, restoreBackup } from '../scripts/lib/backup.ts'

const originalEnv = { ...process.env }, rootUrl = process.env.NUXT_DATABASE_URL
const name = `tebu_deploy_${Date.now()}`, restoreName = `${name}_restore`
const url = new URL(rootUrl); url.pathname = `/${name}`
const restoreUrl = new URL(rootUrl); restoreUrl.pathname = `/${restoreName}`
const root = new pg.Client({ connectionString: rootUrl }), sql = new pg.Client({ connectionString: url.toString() })
const work = await mkdtemp(join(tmpdir(), 'tebu-deploy-')), objects = new Map()
let server, tls, customer, admin, madeDatabase = false, madeRestore = false, output = ''
const s3 = httpServer(async (req, res) => {
  assert.ok(req.headers.authorization?.startsWith('AWS4-HMAC-SHA256 '))
  const key = new URL(req.url, 'http://localhost').pathname
  if (req.method === 'PUT') { const chunks = []; for await (const part of req) chunks.push(part); objects.set(key, Buffer.concat(chunks)); res.writeHead(200, { ETag: '"fixture"' }); res.end() }
  else if (req.method === 'GET' && objects.has(key)) { const bytes = objects.get(key); res.writeHead(200, { 'Content-Length': bytes.length }); res.end(bytes) }
  else if (req.method === 'DELETE') { objects.delete(key); res.writeHead(204); res.end() }
  else { res.writeHead(404, { 'Content-Type': 'application/xml' }); res.end('<Error><Code>NoSuchKey</Code></Error>') }
})
await new Promise(resolve => s3.listen(0, '127.0.0.1', resolve))
const key = randomBytes(32).toString('hex'), backupKey = randomBytes(32).toString('base64')
const env = { ...process.env, NUXT_DATABASE_URL: url.toString(), NUXT_ADMIN_KEY: key, NUXT_DEPLOYMENT_MODE: 'production', NUXT_SITE_URL: 'https://shop.company.com', NUXT_PUBLIC_DEMO: 'false', NUXT_PUBLIC_TESTING_CALENDAR: 'false', NUXT_TRUST_PROXY: 'true', NUXT_PUBLIC_DUITNOW_QR: '/favicon.svg', NUXT_UPLOAD_DIR: join(work, 'uploads'), NUXT_UPLOAD_STORAGE: 'r2', NUXT_R2_ENDPOINT: `http://127.0.0.1:${s3.address().port}`, NUXT_R2_ACCOUNT_ID: '', NUXT_R2_BUCKET: 'media', NUXT_R2_PREFIX: 'tebu/media', NUXT_R2_ACCESS_KEY_ID: 'fixture-access', NUXT_R2_SECRET_ACCESS_KEY: 'fixture-secret', TEBU_BACKUP_ENCRYPTION_KEY: backupKey, TEBU_BACKUP_DIRECTORY: join(work, 'backups'), NITRO_HOST: '127.0.0.1', NITRO_PORT: '3071' }
function command(args, childEnv = env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { env: childEnv, stdio: ['ignore', 'pipe', 'pipe'] }); let out = ''
    child.stdout.on('data', b => out += b); child.stderr.on('data', b => out += b)
    child.once('error', reject); child.once('exit', code => code === 0 ? resolve(out) : reject(new Error(out)))
  })
}
async function stop() { if (server?.exitCode === null && server?.signalCode === null) { const exited = new Promise(resolve => server.once('exit', resolve)); server.kill('SIGTERM'); await exited } }
async function start(extra = {}, imports = []) {
  server = spawn(process.execPath, [...imports.flatMap(path => ['--import', path]), 'scripts/start.mjs'], { env: { ...env, ...extra }, stdio: ['ignore', 'pipe', 'pipe'] })
  server.stdout.on('data', b => output += b); server.stderr.on('data', b => output += b)
  for (let i = 0; i < 100; i++) { try { if ((await fetch('http://127.0.0.1:3071/api/ready')).ok) return } catch {} await delay(100) }
  throw new Error(output)
}
async function json(response) { assert.equal(response.status(), 200, await response.text()); return response.json() }
try {
  await root.connect(); await root.query(`CREATE DATABASE "${name}"`); madeDatabase = true
  await command(['--import', 'tsx', 'scripts/release.ts'])
  await sql.connect()
  assert.equal((await sql.query('SELECT count(*)::int AS n FROM orders')).rows[0].n, 0, 'Production release never inserts sample orders')
  const monday = new Date(); monday.setUTCDate(monday.getUTCDate() + (8 - monday.getUTCDay()) % 7)
  const openingDate = monday.toISOString().slice(0, 10), clock = join(work, 'clock.mjs')
  const clockSource = date => `const D=Date,t=D.parse(${JSON.stringify(date)});globalThis.Date=class extends D{constructor(...a){super(...(a.length?a:[t]))}static now(){return t}}`
  await writeFile(clock, clockSource(`${openingDate}T12:00:00+08:00`))
  await sql.query("INSERT INTO stock_entries(product_id,date,quantity) VALUES('kecik',$1,100)", [openingDate])
  await start({}, [clock])
  await command(['--input-type=module', '-e', `import {spawnSync} from 'node:child_process';const r=spawnSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',${JSON.stringify(join(work, 'key.pem'))},'-out',${JSON.stringify(join(work, 'cert.pem'))},'-days','1','-subj','/CN=localhost','-addext','subjectAltName=DNS:localhost,IP:127.0.0.1']);if(r.status)process.exit(1)`])
  tls = httpsServer({ key: await readFile(join(work, 'key.pem')), cert: await readFile(join(work, 'cert.pem')) }, (req, res) => {
    const upstream = proxyRequest(`http://127.0.0.1:3071${req.url}`, { method: req.method, headers: { ...req.headers, 'x-forwarded-proto': 'https', 'x-forwarded-for': '203.0.113.50' } }, response => { res.writeHead(response.statusCode, response.headers); response.pipe(res) })
    upstream.on('error', () => { res.writeHead(502); res.end() }); req.pipe(upstream)
  })
  await new Promise(resolve => tls.listen(0, '127.0.0.1', resolve))
  const baseURL = `https://127.0.0.1:${tls.address().port}`
  customer = await request.newContext({ baseURL, ignoreHTTPSErrors: true, extraHTTPHeaders: { Origin: baseURL } })
  admin = await request.newContext({ baseURL, ignoreHTTPSErrors: true, extraHTTPHeaders: { Origin: baseURL, Authorization: `Bearer ${key}` } })
  const login = await admin.post('/api/admin/session', { data: {} }); await json(login); assert.match(login.headers()['set-cookie'], /Secure/)
  const catalog = await json(await customer.get('/api/catalog')); assert.ok(catalog.drops.length)
  const date = catalog.drops[0].id
  await json(await customer.post('/api/checkout', { data: { phone: '0129990071', name: 'Deployment fixture — no payment' } }))
  assert.ok((await customer.storageState()).cookies.find(c => c.name === 'tebu_checkout_session')?.secure)
  const sale = await json(await customer.post('/api/orders', { data: { requestId: randomUUID(), scheduleId: date, name: 'Deployment fixture — no payment', cart: { kecik: 1 } } }))
  assert.equal(sale.tag, '#A01')
  const bytes = await sharp({ create: { width: 40, height: 40, channels: 3, background: '#bed09e' } }).png().toBuffer()
  const receipt = await json(await customer.post('/api/uploads', { multipart: { orderToken: sale.token, file: { name: 'test-no-payment.png', mimeType: 'image/png', buffer: bytes } } }))
  await json(await customer.patch(`/api/orders/${sale.token}`, { data: { action: 'receipt', receiptId: receipt.id } }))
  assert.equal((await customer.get(`/api/media/${receipt.id}`)).status(), 401)
  assert.equal((await admin.get(`/api/media/${receipt.id}`)).status(), 200)
  await json(await admin.patch('/api/admin', { data: { action: 'approve', orderToken: sale.token } }))
  await json(await admin.patch('/api/admin', { data: { action: 'pack', orderToken: sale.token, packed: true } }))
  // Advance only the test server clock to the actual delivery day.
  await writeFile(clock, clockSource(`${date}T12:00:00+08:00`))
  await stop(); await start({}, [clock])
  await json(await admin.post('/api/admin/session', { data: {} }))
  const freezer = await json(await admin.post('/api/uploads', { multipart: { scheduleId: date, file: { name: 'test-freezer.png', mimeType: 'image/png', buffer: bytes } } }))
  await json(await admin.patch('/api/admin', { data: { action: 'drop', scheduleId: date, photoId: freezer.id } }))
  assert.equal((await json(await customer.get(`/api/orders/${sale.token}`))).status, 'ready')
  assert.equal((await json(await customer.patch(`/api/orders/${sale.token}`, { data: { action: 'collect' } }))).status, 'collected')
  // Shared-office reads and failed sign-ins have separate limits.
  for (let i = 0; i < 130; i++) assert.equal((await customer.get('/api/health')).status(), 200)
  const attacker = await request.newContext({ baseURL, ignoreHTTPSErrors: true, extraHTTPHeaders: { Origin: baseURL, Authorization: 'Bearer invalid-fixed-token' } })
  for (let i = 0; i < 30; i++) assert.equal((await attacker.post('/api/admin/session', { data: {} })).status(), 401)
  assert.equal((await attacker.post('/api/admin/session', { data: {} })).status(), 429)
  assert.equal((await customer.get(`/api/orders/${sale.token}`)).status(), 200); await attacker.dispose()
  Object.assign(process.env, env)
  const backup = await createBackup(); assert.ok(backup.offsite); assert.equal(backup.media, 2)
  await root.query(`CREATE DATABASE "${restoreName}"`); madeRestore = true
  await assert.rejects(restoreBackup(backup.file, url.toString()), /destination must be empty/)
  const altered = join(work, 'altered.enc'), archive = await readFile(backup.file); archive[archive.length - 1] ^= 1; await writeFile(altered, archive)
  await assert.rejects(restoreBackup(altered, restoreUrl.toString()))
  process.env.NUXT_UPLOAD_DIR = join(work, 'restored-uploads')
  await restoreBackup(backup.file, restoreUrl.toString())
  const restored = new pg.Client({ connectionString: restoreUrl.toString() }); await restored.connect()
  try {
    assert.deepEqual((await restored.query('SELECT tag,status FROM orders')).rows, [{ tag: sale.tag, status: 'collected' }])
    assert.equal((await restored.query('SELECT count(*)::int AS n FROM media')).rows[0].n, 2)
    assert.equal((await restored.query('SELECT next_order_tag() AS tag')).rows[0].tag, '#A02')
  } finally { await restored.end() }
  await stop(); await start({ NUXT_DATABASE_URL: restoreUrl.toString() }, [clock])
  assert.equal((await json(await customer.get(`/api/orders/${sale.token}`))).status, 'collected')
  await stop()
  const invalid = spawn(process.execPath, ['scripts/start.mjs'], { env: { ...env, NUXT_PUBLIC_TESTING_CALENDAR: 'true' }, stdio: ['ignore', 'pipe', 'pipe'] })
  let invalidOutput = ''; invalid.stdout.on('data', b => invalidOutput += b); invalid.stderr.on('data', b => invalidOutput += b)
  const invalidCode = await Promise.race([new Promise(resolve => invalid.once('exit', resolve)), delay(10000).then(() => { invalid.kill('SIGTERM'); throw new Error('Unsafe production config was accepted') })])
  assert.notEqual(invalidCode, 0); assert.match(invalidOutput, /TESTING_CALENDAR/)
  console.log('PASS deployment: empty-database release, encrypted offsite backup, HTTPS secure cookies, real production calendar, order → receipt → approval → packing → delivery → collection, receipt privacy, separate rate limits, safe restore, tamper detection, preserved order counter and production startup guards. No payment or real notification sent.')
} finally {
  await stop(); await customer?.dispose(); await admin?.dispose()
  await new Promise(resolve => tls ? tls.close(resolve) : resolve()); await new Promise(resolve => s3.close(resolve))
  await sql.end().catch(() => {})
  if (madeDatabase) await root.query(`DROP DATABASE "${name}" WITH (FORCE)`)
  if (madeRestore) await root.query(`DROP DATABASE "${restoreName}" WITH (FORCE)`)
  await root.end(); await rm(work, { recursive: true, force: true })
  for (const name of Object.keys(process.env)) if (!(name in originalEnv)) delete process.env[name]
  Object.assign(process.env, originalEnv)
}
