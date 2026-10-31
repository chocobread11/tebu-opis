import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizePhone, total, bottleCount, nextDrops } from '../shared/domain'
test('normalizes common Malaysian mobile formats without accepting non-mobile numbers', () => {
  for (const v of ['012 345 6789', '+60 12-345-6789', '60123456789', '123456789']) assert.equal(normalizePhone(v), '60123456789')
  assert.equal(normalizePhone('01123456789'), '601123456789')
  for (const v of ['03 1234 5678', 'abc0123456789', '60123', '65123456789']) assert.throws(() => normalizePhone(v))
})
test('prices in integer sen and distinguishes bottles from add-ons', () => {
  const cart = { flask: 2, jug: 1, asam: 1, limau: 2 }
  assert.equal(total(cart), 2600); assert.equal(bottleCount(cart), 3)
})
test('drop dates skip weekends, use Malaysia time and cross month boundaries', () => {
  assert.deepEqual(nextDrops(new Date('2026-10-31T08:00:00Z')).map(d => d.id), ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05'])
  assert.equal(nextDrops(new Date('2026-11-01T17:00:00Z'))[0]?.id, '2026-11-03')
})
