import test from 'node:test'
import assert from 'node:assert/strict'
import { guardOrderChange } from '../server/utils/order-guards'
import { reservationExpired, reservationSeconds, canDeleteOrder } from '../shared/order'
import { paymentChanges, paymentOptions } from '../shared/payment'
import type { Order } from '../generated/prisma/client'

const order = (changes: Partial<Order> = {}) => ({ status: 'confirmed', fulfilled: false, refundedTotal: 0, total: 1200, cart: { kecik: 2 }, scheduleId: '2026-11-17', manualPaymentStatus: null, ...changes } as Order)

test('collection preserves quantities, date and fulfilment while permitting metadata corrections', () => {
  for (const current of [order({ status: 'collected' }), order({ fulfilled: true })]) {
    assert.throws(() => guardOrderChange(current, { status: 'rejected' }))
    assert.throws(() => guardOrderChange(current, { cart: { kecik: 1 } }))
    assert.throws(() => guardOrderChange(current, { scheduleId: '2026-11-18' }))
    assert.doesNotThrow(() => guardOrderChange(current, { status: 'collected', cart: { kecik: 2 } }))
    assert.equal(canDeleteOrder(current), false)
  }
})

test('paid cancellations require a full refund and refunded orders cannot be rewritten', () => {
  assert.throws(() => guardOrderChange(order(), { status: 'rejected' }))
  assert.throws(() => guardOrderChange(order({ refundedTotal: 500 }), { status: 'rejected' }))
  const refunded = order({ refundedTotal: 1200 })
  assert.doesNotThrow(() => guardOrderChange(refunded, { status: 'rejected' }))
  assert.throws(() => guardOrderChange(refunded, { cart: { kecik: 1 } }))
  assert.throws(() => guardOrderChange(refunded, { status: 'ready' }))
  assert.deepEqual(paymentOptions(refunded), [])
  assert.equal(canDeleteOrder(refunded), false)
})

test('manual collection remains independent of payment and online collection stays paid', () => {
  const manual = order({ status: 'collected', fulfilled: true, manualPaymentStatus: 'unpaid' })
  assert.deepEqual(paymentChanges(manual, 'paid'), { manualPaymentStatus: 'paid' })
  assert.deepEqual(paymentChanges({ ...manual, manualPaymentStatus: 'paid' }, 'unpaid'), { manualPaymentStatus: 'unpaid' })
  assert.throws(() => paymentChanges(order({ status: 'collected', fulfilled: true }), 'unpaid'))
  assert.equal(canDeleteOrder(order({ status: 'pending_payment' })), true)
})

test('reservation expiry applies at the exact boundary only to pending payments', () => {
  const expiresAt = '2026-11-17T04:00:00Z', now = Date.parse(expiresAt)
  assert.equal(reservationExpired({ status: 'pending_payment', expiresAt }, now - 1), false)
  assert.equal(reservationExpired({ status: 'pending_payment', expiresAt }, now), true)
  assert.equal(reservationExpired({ status: 'pending_review', expiresAt }, now), false)
  assert.equal(reservationExpired({ status: 'pending_payment' }, now), false)
  assert.equal(reservationSeconds({ expiresAt }, now - 1001), 2)
  assert.equal(reservationSeconds({ expiresAt }, now + 1), 0)
})
