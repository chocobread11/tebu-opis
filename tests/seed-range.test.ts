import test from 'node:test'
import assert from 'node:assert/strict'
import { developmentSeedRange } from '../scripts/seed-range'

test('development samples cover this Friday through the following Saturday', () => {
  const range = developmentSeedRange(new Date('2026-11-11T08:00:00Z'))
  assert.equal(range.start, '2026-11-13')
  assert.equal(range.end, '2026-11-21')
  assert.equal(range.days.length, 9)
  assert.deepEqual(range.days, ['2026-11-13', '2026-11-14', '2026-11-15', '2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21'])
})

test('seed range uses Malaysia dates and crosses month and year boundaries', () => {
  assert.equal(developmentSeedRange(new Date('2026-11-12T16:00:00Z')).start, '2026-11-13')
  assert.equal(developmentSeedRange(new Date('2026-11-13T16:00:00Z')).start, '2026-11-20')
  const range = developmentSeedRange(new Date('2026-12-30T00:00:00Z'))
  assert.equal(range.start, '2027-01-01')
  assert.equal(range.end, '2027-01-09')
})
