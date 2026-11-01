import { createHash } from 'node:crypto'
import type { Cart, Ticket } from '../shared/domain'

// Public, deterministic credentials for local fixtures only.
export const sampleToken = (label: string) => createHash('sha256').update(`tebu-sample:${label}`).digest('base64url')
export const sampleId = (number: number) => `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`
export const sampleCustomers = [
  { id: sampleId(1), name: 'Aina Sample', phone: '60100000001' },
  { id: sampleId(2), name: 'Daniel Sample', phone: '60100000002' },
  { id: sampleId(3), name: 'Mei Sample', phone: '60100000003' },
  { id: sampleId(4), name: 'Ravi Sample', phone: '60100000004' },
]
export const sampleOrders: { status: Ticket['status']; customer: number; cart: Cart; packed?: boolean; past?: boolean; expired?: boolean }[] = [
  { status: 'pending_payment', customer: 0, cart: { flask: 1, jug: 0, asam: 1, limau: 0 } },
  { status: 'pending_review', customer: 1, cart: { flask: 2, jug: 0, asam: 0, limau: 2 } },
  { status: 'confirmed', customer: 2, cart: { flask: 0, jug: 1, asam: 1, limau: 1 } },
  { status: 'confirmed', customer: 3, cart: { flask: 1, jug: 1, asam: 0, limau: 0 }, packed: true },
  { status: 'ready', customer: 0, cart: { flask: 2, jug: 0, asam: 2, limau: 0 }, packed: true, past: true },
  { status: 'collected', customer: 1, cart: { flask: 0, jug: 2, asam: 1, limau: 1 }, packed: true, past: true },
  { status: 'rejected', customer: 2, cart: { flask: 1, jug: 0, asam: 0, limau: 0 } },
  { status: 'pending_payment', customer: 3, cart: { flask: 3, jug: 0, asam: 0, limau: 1 }, expired: true },
]
