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

test('month grids align Monday through Sunday and support leap years', async () => {
  const { monthDays, defaultMonthSchedules, malaysiaToday } = await import('../shared/domain')
  const november = monthDays('2026-11')
  assert.equal(november.length % 7, 0)
  assert.deepEqual(november.slice(0, 7), [null, null, null, null, null, null, '2026-11-01'])
  assert.equal(november.filter(Boolean).length, 30)
  assert.equal(monthDays('2028-02').filter(Boolean).length, 29)
  const dates = defaultMonthSchedules(new Date('2026-12-30T18:00:00Z'))
  assert.ok(dates.some(day => day.id.startsWith('2027-01')))
  assert.ok(dates.every(day => day.id > '2026-12-31'))
  assert.equal(malaysiaToday(new Date('2026-11-01T17:00:00Z')), '2026-11-02')
})

test('ordering week rolls over on Sunday in Malaysia, including year boundaries', async () => {
  const { activeOrderingWeek } = await import('../shared/domain')
  const saturday = activeOrderingWeek(new Date('2026-11-07T15:59:59Z'))
  assert.equal(saturday.start, '2026-11-02')
  assert.equal(saturday.end, '2026-11-08')
  const sunday = activeOrderingWeek(new Date('2026-11-07T16:00:00Z'))
  assert.equal(sunday.start, '2026-11-09')
  assert.equal(sunday.end, '2026-11-15')
  assert.equal(sunday.days.length, 7)
  assert.equal(sunday.restockDate, '2026-11-08')
  assert.equal(sunday.refreshAt, '2026-11-15T00:00:00+08:00')
  assert.deepEqual(activeOrderingWeek(new Date('2026-11-09T04:00:00Z')).days, sunday.days)
  const rollover = activeOrderingWeek(new Date('2026-12-26T16:00:00Z'))
  assert.equal(rollover.start, '2026-12-28')
  assert.equal(rollover.end, '2027-01-03')
})

test('daily defaults reserve eight small bottles and three big bottles', async () => {
  const { dailyBottleStandard, dailyBottleCapacity, describeDrop } = await import('../shared/domain')
  assert.deepEqual(dailyBottleStandard, { flask: 8, jug: 3 })
  assert.equal(dailyBottleCapacity, 11)
  assert.equal(describeDrop('2026-11-02').capacity, 11)
  assert.ok(nextDrops(new Date('2026-11-01T00:00:00Z')).every(day => day.capacity === 11 && day.remaining === 11))
})

test('public delivery dates show only active weekdays, with Friday optional', async () => {
  const { publicDeliveryDays, activeOrderingWeek, isOfficeWeekday } = await import('../shared/domain')
  const now = new Date('2026-11-01T08:00:00Z')
  const week = activeOrderingWeek(now)
  const days = week.days.map(id => ({ id, open: true, capacity: 11, remaining: 11 }))
  assert.deepEqual(publicDeliveryDays(days, week, now).map(day => day.id), week.days.slice(0, 5))
  assert.equal(isOfficeWeekday('2026-11-07'), false)
  assert.equal(isOfficeWeekday('2026-11-08'), false)
  assert.equal(isOfficeWeekday('2026-11-06'), true)
  assert.deepEqual(publicDeliveryDays(days.map(day => ({ ...day, open: day.id !== '2026-11-06' })), week, now).map(day => day.id), week.days.slice(0, 4))
  const modified = days.map(day => ({ ...day, open: day.id !== '2026-11-04', removedAt: day.id === '2026-11-05' ? now.toISOString() : null, droppedAt: day.id === '2026-11-03' ? now.toISOString() : null }))
  assert.deepEqual(publicDeliveryDays(modified, week, now).map(day => day.id), ['2026-11-02', '2026-11-06'])
  assert.deepEqual(publicDeliveryDays(days, week, new Date('2026-11-04T08:00:00Z')).map(day => day.id), ['2026-11-05', '2026-11-06'])
  assert.deepEqual(publicDeliveryDays(days, week, new Date('2026-11-07T08:00:00Z')), [])
})
