import './helpers/disable-telegram.mjs'
import 'dotenv/config'
import assert from 'node:assert/strict'
import { randomBytes, createHash } from 'node:crypto'
import { spawn, spawnSync } from 'node:child_process'
import pg from 'pg'
import { chromium } from 'playwright'

const name = `tebu_session_test_${randomBytes(8).toString('hex')}`
const url = new URL(process.env.NUXT_DATABASE_URL)
url.pathname = `/${name}`
const root = new pg.Client({ connectionString: process.env.NUXT_DATABASE_URL })
const database = new pg.Client({ connectionString: url.toString() })
const port = '3053', base = `http://127.0.0.1:${port}`
const env = { ...process.env, NUXT_DATABASE_URL: url.toString(), NUXT_PUBLIC_DEMO: 'false', NITRO_HOST: '127.0.0.1', NITRO_PORT: port }
const phone = '0129990081', password = 'session-test-password'
const digest = token => createHash('sha256').update(token).digest('hex')
let server, browser, created = false, output = ''
const request = async (path, { body, cookie, headers, ...options } = {}) => {
  const response = await fetch(base + path, { ...options, ...(body ? { method: options.method || 'POST', body: JSON.stringify(body) } : {}), headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}), ...headers } })
  return { status: response.status, data: await response.json(), cookie: response.headers.get('set-cookie') || '' }
}
try {
  await root.connect(); await root.query(`CREATE DATABASE "${name}"`); created = true
  const migration = spawnSync('bun', ['prisma', 'migrate', 'deploy'], { env, encoding: 'utf8' })
  assert.equal(migration.status, 0, migration.stderr)
  await database.connect()
  server = spawn(process.execPath, ['.output/server/index.mjs'], { env, stdio: ['ignore', 'pipe', 'pipe'] })
  server.stdout.on('data', chunk => { output += chunk }); server.stderr.on('data', chunk => { output += chunk })
  for (let attempt = 0; attempt < 100; attempt++) {
    try { if ((await fetch(base + '/api/health')).ok) break } catch {}
    if (server.exitCode !== null) throw new Error(output)
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  const login = await request('/api/identity', { body: { phone, name: 'Session User', protectHistory: true, password } })
  assert.equal(login.status, 200)
  assert.ok(login.data.token, 'API clients can still use bearer authentication')
  assert.match(login.cookie, /HttpOnly/i); assert.match(login.cookie, /SameSite=Lax/i); assert.match(login.cookie, /Max-Age=1800/i)
  assert.ok(Math.abs(new Date(login.data.expiresAt).getTime() - Date.now() - 30 * 60_000) < 2000)
  const cookie = login.cookie.split(';')[0]
  const resumed = await request('/api/identity', { cookie, body: { phone, mode: 'history', cookieSession: true } })
  assert.equal(resumed.data.passwordRequired, false); assert.equal(resumed.data.token, undefined)
  assert.equal(resumed.data.expiresAt, login.data.expiresAt, 'Automatic lookup does not extend the expiry')
  assert.equal((await database.query('SELECT count(*)::int AS count FROM customer_sessions')).rows[0].count, 1)
  assert.equal((await request('/api/orders', { cookie })).status, 200)
  const https = await request('/api/identity', { headers: { 'X-Forwarded-Proto': 'https' }, body: { phone, mode: 'history', password } })
  assert.match(https.cookie, /; Secure/i)
  await database.query("UPDATE customer_sessions SET expires_at=now()-interval '1 minute' WHERE token_hash=$1", [digest(login.data.token)])
  assert.equal((await request('/api/orders', { cookie })).status, 401)
  assert.equal((await request('/api/identity', { cookie, body: { phone, mode: 'history' } })).data.passwordRequired, true)
  console.log('PASS API: 30-minute server expiry, HttpOnly/SameSite cookies, HTTPS Secure flag, fixed expiry on reuse, token compatibility and expired-session rejection.')

  browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const page = await context.newPage(); page.setDefaultTimeout(12000)
  await page.goto(base + '/drop')
  await page.getByLabel('Mobile number', { exact: true }).fill(phone)
  await page.getByRole('button', { name: 'View transactions', exact: true }).click()
  await page.getByLabel('History password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Unlock transactions', exact: true }).click()
  await page.getByRole('button', { name: 'Lock history', exact: true }).waitFor()
  const browserCookie = (await context.cookies()).find(row => row.name === 'tebu_customer_session')
  assert.ok(browserCookie.httpOnly)
  assert.equal(await page.evaluate(() => document.cookie.includes('tebu_customer_session')), false)
  assert.equal(await page.evaluate(() => localStorage.getItem('customer_token')), null)
  assert.equal(await page.evaluate(secret => JSON.stringify(localStorage).includes(secret), password), false)
  await page.reload()
  await page.getByRole('button', { name: 'Lock history', exact: true }).waitFor()
  assert.equal(await page.getByLabel('History password', { exact: true }).count(), 0)
  const tab = await context.newPage()
  await tab.goto(base + '/drop')
  await tab.getByRole('button', { name: 'Lock history', exact: true }).waitFor()
  assert.equal((await context.cookies()).find(row => row.name === 'tebu_customer_session').value, browserCookie.value)
  assert.equal((await context.cookies()).find(row => row.name === 'tebu_customer_session').expires, browserCookie.expires)
  await page.getByRole('button', { name: 'Lock history', exact: true }).click()
  await page.getByLabel('History password', { exact: true }).waitFor()
  assert.equal((await context.cookies()).some(row => row.name === 'tebu_customer_session'), false)
  assert.equal((await request('/api/orders', { headers: { Authorization: `Bearer ${browserCookie.value}` } })).status, 401, 'Locking revokes the server session')
  await page.reload()
  await page.getByLabel('History password', { exact: true }).waitFor()
  await page.getByLabel('History password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Unlock transactions', exact: true }).click()
  await page.getByRole('button', { name: 'Lock history', exact: true }).waitFor()
  const renewed = (await context.cookies()).find(row => row.name === 'tebu_customer_session')
  await database.query("UPDATE customer_sessions SET expires_at=now()-interval '1 minute' WHERE token_hash=$1", [digest(renewed.value)])
  await page.reload()
  await page.getByLabel('History password', { exact: true }).waitFor()
  assert.equal(await page.getByRole('button', { name: 'Lock history', exact: true }).count(), 0)
  console.log('PASS browser: refresh and new-tab reuse, no password/token in browser storage, lock history revokes access, and expired sessions ask for the password again.')
} finally {
  await browser?.close()
  if (server && server.exitCode === null && server.signalCode === null) {
    const exit = new Promise(resolve => server.once('exit', resolve)); server.kill('SIGTERM'); await exit
  }
  await database.end().catch(() => {})
  if (created) await root.query(`DROP DATABASE "${name}" WITH (FORCE)`)
  await root.end()
}
