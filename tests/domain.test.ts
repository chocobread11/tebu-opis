import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizePhone, total, bottleCount, nextDrops } from '../shared/domain'
test('normalizes common Malaysian mobile formats without accepting non-mobile numbers', () => {
  for (const v of ['012 345 6789', '+60 12-345-6789', '60123456789', '123456789']) assert.equal(normalizePhone(v), '60123456789')
  assert.equal(normalizePhone('01123456789'), '601123456789')
  for (const v of ['03 1234 5678', 'abc0123456789', '60123', '65123456789']) assert.throws(() => normalizePhone(v))
})
test('prices in integer sen and distinguishes bottles from add-ons', () => {
  const cart = { kecik: 2, besar: 1, asam: 1, limau: 2 }
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

test('daily defaults share twelve spaces between both bottle sizes', async () => {
  const { dailyBottleStandard, dailyBottleCapacity, describeDrop } = await import('../shared/domain')
  assert.deepEqual(dailyBottleStandard, { kecik: 12, besar: 6 })
  assert.equal(dailyBottleCapacity, 12)
  assert.equal(describeDrop('2026-11-02').capacity, 12)
  assert.ok(nextDrops(new Date('2026-11-01T00:00:00Z')).every(day => day.capacity === 12 && day.remaining === 12))
})

test('mixed bottles consume shared spaces while physical bottle counts stay separate', async () => {
  const { bottleSpaces, boxAvailability, availableBottles } = await import('../shared/domain')
  for (const cart of [{ kecik: 12, besar: 0 }, { kecik: 0, besar: 6 }, { kecik: 4, besar: 4 }, { kecik: 8, besar: 2 }]) {
    assert.equal(bottleSpaces(cart), 12)
    assert.equal(boxAvailability(12, cart).remaining, 0)
  }
  const lastSpace = boxAvailability(12, { kecik: 1, besar: 5 })
  assert.equal(lastSpace.remaining, 1)
  assert.equal(lastSpace.kecikRemaining, 1)
  assert.equal(lastSpace.besarRemaining, 0)
  assert.equal(availableBottles('kecik', 12, { kecik: 0, besar: 2 }, 20), 8)
  assert.equal(availableBottles('besar', 12, { kecik: 3, besar: 0 }, 20), 4)
  assert.equal(availableBottles('kecik', 12, { kecik: 0, besar: 0 }, 3), 3)
  assert.equal(availableBottles('besar', 1, { kecik: 0, besar: 0 }, 20), 0)
  assert.equal(availableBottles('kecik', 1, { kecik: 0, besar: 1 }, 20), 0)
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

test('ticket status includes packing and WhatsApp links preserve the private token', async () => {
  const { ticketStatusLabel, ticketWhatsAppUrl } = await import('../shared/domain')
  assert.equal(ticketStatusLabel({ status: 'confirmed', packed: false }), 'Payment confirmed')
  assert.equal(ticketStatusLabel({ status: 'confirmed', packed: true }), 'Packed — awaiting pantry drop')
  assert.equal(ticketStatusLabel({ status: 'ready', packed: true }), 'Ready for pickup')
  const url = new URL(ticketWhatsAppUrl({ phone: '60123456789', token: 'private-token', name: 'A & B', tag: '#A01' }, 'https://tebu.example'))
  assert.equal(url.origin, 'https://wa.me')
  assert.equal(url.pathname, '/60123456789')
  assert.ok(url.searchParams.get('text')!.includes('https://tebu.example/drop?t=private-token'))
  assert.equal(ticketWhatsAppUrl({ phone: '', token: 'x', name: 'A', tag: '#A01' }, 'https://tebu.example'), '')
})

test('testing calendar starts today in Malaysia and shows five consecutive dates including weekends', async () => {
  const { testingOrderingWindow, publicDeliveryDays } = await import('../shared/domain')
  const now = new Date('2026-12-31T16:00:00Z')
  const window = testingOrderingWindow(now)
  assert.deepEqual(window.days, ['2027-01-01', '2027-01-02', '2027-01-03', '2027-01-04', '2027-01-05'])
  assert.equal(window.start, '2027-01-01')
  assert.equal(window.end, '2027-01-05')
  assert.equal(window.refreshAt, '2027-01-02T00:00:00+08:00')
  const days = ['2026-12-31', ...window.days, '2027-01-06'].map(id => ({ id, open: true, capacity: 11, remaining: 11 }))
  assert.deepEqual(publicDeliveryDays(days, window, now, true).map(day => day.id), window.days)
  assert.deepEqual(publicDeliveryDays(days, window, now).map(day => day.id), ['2027-01-04', '2027-01-05'])
})
