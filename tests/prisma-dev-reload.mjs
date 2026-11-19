import 'dotenv/config'
import assert from 'node:assert/strict'
import { readFile, stat, utimes } from 'node:fs/promises'
import { setTimeout as delay } from 'node:timers/promises'

// Run against an existing development server. Only reads authenticated endpoints
// and touches the generated client's mtime; no database records are changed.
const base = process.env.TEBU_TEST_URL || 'http://127.0.0.1:3000'
const headers = { Authorization: `Bearer ${process.env.NUXT_ADMIN_KEY || ''}` }
const bundle = `${process.env.NUXT_BUILD_DIR || '.nuxt'}/dev/index.mjs`
async function check(path) {
  const response = await fetch(base + path, { headers })
  assert.equal(response.status, 200, `${path} must work on the running dev server`)
  const data = await response.json()
  assert.equal(typeof data.whatsappOpening, 'string')
}
await check('/api/admin')
await check('/api/admin/settings')
const previous = (await stat(bundle)).mtimeMs
const now = new Date()
await utimes('generated/prisma/internal/class.ts', now, now)
let reloaded = false
for (let attempt = 0; attempt < 120; attempt++) {
  await delay(250)
  try {
    if ((await stat(bundle)).mtimeMs <= previous) continue
    if (!(await readFile(bundle, 'utf8')).includes('ShopSettings')) continue
    await check('/api/admin')
    await check('/api/admin/settings')
    reloaded = true; break
  } catch { /* A dev restart can briefly interrupt the endpoint. */ }
}
assert.ok(reloaded, 'Changing the generated Prisma runtime must rebuild the dev server with the settings model')
console.log('PASS: running admin/settings endpoints and automatic dev reload after a generated Prisma client change.')
