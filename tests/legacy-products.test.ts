import test from 'node:test'
import assert from 'node:assert/strict'
import { migrateStoredCart, migrateStoredHarvest, migrateStoredTicket } from '../shared/legacy-products'
import type { Harvest, Ticket } from '../shared/domain'

test('old browser carts and ticket items retain quantities and checkout prices', () => {
  const legacy = { cart: { flask: 2, jug: 1, asam: 1, limau: 0 }, total: 2375, items: [
    { productId: 'flask', name: 'The Everyday Flask', size: '500 ml', quantity: 2, unitPrice: 625 },
    { productId: 'jug', name: 'The Sharing Jug', size: '1 litre', quantity: 1, unitPrice: 1025 },
  ] } as unknown as Ticket
  const migrated = migrateStoredTicket(legacy)
  assert.deepEqual(migrated.cart, { kecik: 2, besar: 1, asam: 1, limau: 0 })
  assert.equal(migrated.total, legacy.total)
  assert.deepEqual(migrated.items, [
    { productId: 'kecik', name: 'Botol Kecik', size: '500ml', quantity: 2, unitPrice: 625 },
    { productId: 'besar', name: 'Botol Besar', size: '1l', quantity: 1, unitPrice: 1025 },
  ])
  assert.deepEqual(migrateStoredTicket(migrated), migrated)
  assert.deepEqual(migrateStoredCart({ kecik: 0, besar: 2, flask: 3, jug: 4 }), { kecik: 0, besar: 2, asam: 0, limau: 0 })
})

test('old browser harvests remain readable and importable without legacy fields', () => {
  const migrated = migrateStoredHarvest({ id: 'fixture', date: '2026-11-01', quantity: 12, type: 'Tebu 1', flaskQty: 15, jugQty: 8 } as unknown as Harvest)
  assert.deepEqual(migrated, { id: 'fixture', date: '2026-11-01', quantity: 12, type: 'Tebu 1', kecikQty: 15, besarQty: 8 })
  assert.deepEqual(migrateStoredHarvest(migrated), migrated)
})
