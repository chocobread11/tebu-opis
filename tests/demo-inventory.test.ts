import test from 'node:test'
import assert from 'node:assert/strict'
import { demoInventory } from '../shared/demo-inventory'
import { migrateStoredTicket } from '../shared/legacy-products'
import { products, type Ticket, type Product } from '../shared/domain'

test('four demo products restock independently and opening stock remains in the ledger', () => {
  const initial = demoInventory(null, [], [])
  assert.equal(initial.products.filter(p => p.kind === 'bottle').length, 4)
  assert.equal(initial.entries.length, 4)
  const next = demoInventory(initial.products, [...initial.entries, { id: 'fresh', productId: 'tebu-2-besar', date: '2026-01-01', quantity: 3, note: '' }], [])
  assert.equal(next.products.find(p => p.id === 'tebu-2-besar')?.stocks?.[0]?.stocked, 13)
  assert.equal(next.products.find(p => p.id === 'besar')?.stocks?.[0]?.stocked, 20)
  const cleared = demoInventory(next.products, [], [])
  assert.ok(cleared.products.every(p => p.stocks?.[0]?.stocked === 0), 'Deleting opening stock must not recreate it')
})

test('old browser variety stock and tickets move together, and snapshots stay intact', () => {
  const old = [{ ...products[0]!, name: 'Custom Small', varietyTracked: true, stocks: [{ varietyId: 'tebu-1', stocked: 12, reserved: 0, remaining: 12 }, { varietyId: 'tebu-2', stocked: 9, reserved: 2, remaining: 7 }] }] as Product[]
  const ticket = migrateStoredTicket({ varietyId: 'tebu-2', varietyName: 'Tebu 2', cart: { kecik: 2 }, status: 'confirmed', items: [{ productId: 'kecik', name: 'Custom Small', size: '500ml', quantity: 2, unitPrice: 750 }] } as unknown as Ticket)
  const current = demoInventory(old, [{ id: 'old-restock', productId: 'kecik', varietyId: 'tebu-2', date: '2026-01-01', quantity: 3, note: '' }], [ticket])
  assert.equal(current.products.find(p => p.id === 'tebu-2-kecik')?.stocks?.[0]?.remaining, 7)
  assert.equal(ticket.items?.[0]?.unitPrice, 750)
  assert.equal(ticket.items?.[0]?.name, 'Tebu 2 · Custom Small')
  assert.deepEqual(migrateStoredTicket(ticket), ticket)
  assert.deepEqual(demoInventory(current.products, current.entries, [ticket]), current)
})
