import test from 'node:test'
import assert from 'node:assert/strict'
import { paymentStatus, paymentLabel, paymentOptions, paymentChanges } from '../shared/payment'

test('payment badges distinguish receipt review, online payments and unpaid manual orders', () => {
  assert.equal(paymentStatus({ status: 'pending_payment' }), 'unpaid')
  assert.equal(paymentStatus({ status: 'pending_review' }), 'review')
  for (const status of ['confirmed', 'ready', 'collected']) {
    assert.equal(paymentStatus({ status }), 'paid')
    assert.equal(paymentStatus({ status, manualPaymentStatus: 'unpaid' }), 'unpaid')
  }
  assert.equal(paymentStatus({ status: 'rejected', manualPaymentStatus: 'paid' }), 'rejected')
  assert.equal(paymentLabel({ status: 'rejected', manualPaymentStatus: 'paid' }), 'Cancelled')
})

test('manual payment corrections leave packing and fulfillment unchanged', () => {
  assert.deepEqual(paymentChanges({ status: 'collected', manualPaymentStatus: 'unpaid' }, 'paid'), { manualPaymentStatus: 'paid' })
  assert.deepEqual(paymentChanges({ status: 'ready', manualPaymentStatus: 'paid' }, 'unpaid'), { manualPaymentStatus: 'unpaid' })
  assert.deepEqual(paymentOptions({ status: 'rejected', manualPaymentStatus: 'paid' }), [])
  assert.throws(() => paymentChanges({ status: 'rejected', manualPaymentStatus: 'paid' }, 'unpaid'))
})

test('online payment changes renew unpaid reservations and clear stale packing flags', () => {
  const now = new Date('2026-11-12T00:00:00Z')
  assert.deepEqual(paymentChanges({ status: 'confirmed' }, 'unpaid', now), { status: 'pending_payment', packed: false, notified: false, expiresAt: '2026-11-12T00:20:00.000Z' })
  assert.deepEqual(paymentChanges({ status: 'pending_review' }, 'paid'), { status: 'confirmed' })
  assert.deepEqual(paymentChanges({ status: 'confirmed', receiptId: 'receipt' }, 'review'), { status: 'pending_review', packed: false, notified: false })
  assert.deepEqual(paymentChanges({ status: 'pending_review' }, 'rejected'), { status: 'rejected', packed: false, notified: false })
  assert.deepEqual(paymentChanges({ status: 'collected' }, 'paid'), {})
  assert.throws(() => paymentChanges({ status: 'pending_payment' }, 'review'))
})
