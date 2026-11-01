import assert from 'node:assert/strict'
process.env.NUXT_PUBLIC_DEMO = 'false'
process.env.NUXT_DATABASE_URL = ''
process.env.NUXT_ADMIN_KEY = ''
// Nuxt's prerender harness exposes in-process requests without opening a port.
// Run npm run generate first. The Node server bundle starts a listener on import.
const { localFetch, closePrerenderer } = await import('../.nuxt/prerender/index.mjs')
const request = (path, options = {}) => localFetch(path, { ...options, headers: { host: 'localhost', ...options.headers } })
try {
  for (const [path, text] of [['/', 'A little cane.'], ['/drop', 'Past transactions.'], ['/admin', 'Your drop checklist.'], ['/admin/calendar', 'Plan your drops.'], ['/admin/log', 'A little bookkeeping.']]) {
    const response = await request(path)
    assert.equal(response.status, 200)
    const html = await response.text()
    assert.ok(html.includes(text), `Missing expected content on ${path}`)
    assert.ok(html.includes('demo:false') || html.includes('"demo":false'), 'Production runtime must disable demo mode')
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff')
  }
  assert.equal((await request('/api/health')).status, 200)
  assert.equal((await request('/api/admin')).status, 401)
  assert.equal((await request('/api/orders')).status, 401)
  assert.equal((await request('/api/orders/not-a-token')).status, 404)
  assert.equal((await request('/api/catalog')).status, 503)
  assert.equal((await request('/api/orders', { method: 'POST', headers: { 'content-type': 'application/json', 'content-length': '2' }, body: '{}' })).status, 401)
  assert.equal((await request('/api/identity', { method: 'POST', headers: { origin: 'https://untrusted.example', 'content-length': '2' }, body: '{}' })).status, 403)
  assert.equal((await request('/api/uploads', { method: 'POST', headers: { 'content-length': '400000' }, body: '{}' })).status, 413)
  const privateResponse = await request('/api/admin')
  assert.equal(privateResponse.headers.get('cache-control'), 'no-store')
  console.log('PASS: SSR routes, production demo toggle, health, admin/token guards, missing-DB guard, cross-origin rejection, upload limit, private cache headers.')
} finally { await closePrerenderer() }
