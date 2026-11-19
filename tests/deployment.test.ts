import test from 'node:test'
import assert from 'node:assert/strict'
import { productionConfigIssues } from '../server/deployment/config'
import { RequestLimiter, rateLimitBucket, sessionFingerprint } from '../server/security/rate-limit'

const config = { deploymentMode: 'production', databaseUrl: 'postgresql://fixture', siteUrl: 'https://shop.company.com', adminKey: 'a'.repeat(64), uploadStorage: 'r2', public: { demo: false, testingCalendar: false }, r2: { accountId: 'account', endpoint: '', bucket: 'media', accessKeyId: 'access', secretAccessKey: 'secret' } }
test('production refuses test calendars, LAN links, weak keys and missing storage', () => {
  assert.deepEqual(productionConfigIssues(config), [])
  assert.deepEqual(productionConfigIssues({ ...config, deploymentMode: 'development', siteUrl: 'http://192.168.1.2:3000' }), [])
  for (const siteUrl of ['', 'http://shop.company.com', 'https://192.168.1.2', 'https://localhost', 'https://shop.example', 'https://shop.company.com/path', 'https://user:password@shop.company.com']) assert.ok(productionConfigIssues({ ...config, siteUrl }).length, siteUrl)
  assert.ok(productionConfigIssues({ ...config, public: { demo: false, testingCalendar: true } }).length)
  assert.ok(productionConfigIssues({ ...config, adminKey: 'replace-with-at-least-32-random-characters' }).length)
  assert.ok(productionConfigIssues({ ...config, uploadStorage: 'local' }).length)
  assert.ok(productionConfigIssues({ ...config, r2: { ...config.r2, secretAccessKey: '' } }).length)
})
test('office polling has its own budget and never consumes checkout or sign-in allowance', () => {
  const limiter = new RequestLimiter(), read = rateLimitBucket('GET', '/api/catalog')
  // Fifty people poll every five seconds behind the same office router.
  for (let n = 0; n < 600; n++) assert.equal(limiter.consume('read:office', read.ip, 60_000, 1000), 0)
  assert.equal(limiter.consume('checkout:office', rateLimitBucket('POST', '/api/orders').ip, 60_000, 1000), 0)
  const auth = rateLimitBucket('POST', '/api/admin/session')
  for (let n = 0; n < auth.ip; n++) assert.equal(limiter.consume('auth:office', auth.ip, 60_000, 1000), 0)
  assert.equal(limiter.consume('auth:office', auth.ip, 60_000, 1000), 60)
  assert.equal(limiter.consume('read:office', read.ip, 60_000, 1000), 0)
  assert.equal(limiter.consume('auth:office', auth.ip, 60_000, 61_000), 0)
  assert.equal(limiter.consume('auth:another-office', auth.ip, 60_000, 1000), 0)
  assert.notEqual(sessionFingerprint('customer-one'), sessionFingerprint('customer-two'))
  assert.equal(sessionFingerprint('customer-one').length, 64)
})
