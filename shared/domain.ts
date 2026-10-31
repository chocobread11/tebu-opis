export type ProductId = 'flask' | 'jug' | 'asam' | 'limau'
export type Cart = Record<ProductId, number>
export const products = [
  { id: 'flask' as const, name: 'The Everyday Flask', size: '500 ml', price: 600, description: 'Your desk-side pick-me-up.', kind: 'bottle' },
  { id: 'jug' as const, name: 'The Sharing Jug', size: '1 litre', price: 1100, description: 'A little more to go around.', kind: 'bottle' },
  { id: 'asam' as const, name: 'Asam Boi', size: '1 pouch', price: 100, description: 'Sweet meets salty.', kind: 'addon' },
  { id: 'limau' as const, name: 'Limau Kasturi', size: '1 pouch', price: 100, description: 'A fresh citrus kick.', kind: 'addon' },
]
export function emptyCart(): Cart { return { flask: 0, jug: 0, asam: 0, limau: 0 } }
export function total(cart: Cart) { return products.reduce((sum, p) => sum + p.price * cart[p.id], 0) }
export function bottleCount(cart: Cart) { return cart.flask + cart.jug }
export function money(cents: number) { return `RM ${(cents / 100).toFixed(2)}` }
export function normalizePhone(value: string) {
  const raw = value.replace(/[\s()+-]/g, '')
  const phone = raw.startsWith('0') ? `6${raw}` : raw.startsWith('1') ? `60${raw}` : raw
  if (!/^601\d{8,9}$/.test(phone)) throw new Error('Enter a valid Malaysian mobile number, e.g. 012 345 6789.')
  return phone
}
export function nextDrops(now = new Date()) {
  // Use the pantry's timezone rather than the visitor's device timezone.
  const today = new Date(`${new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kuala_Lumpur', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)}T00:00:00Z`)
  const result: { id: string; day: string; date: string; full: string; capacity: number; remaining: number }[] = []
  for (let i = 1; result.length < 4; i++) {
    const d = new Date(today); d.setUTCDate(d.getUTCDate() + i)
    if (d.getUTCDay() < 1 || d.getUTCDay() > 4) continue
    result.push({ id: d.toISOString().slice(0, 10), day: d.toLocaleDateString('en', { weekday: 'short', timeZone: 'UTC' }), date: d.toLocaleDateString('en', { day: 'numeric', month: 'short', timeZone: 'UTC' }), full: d.toLocaleDateString('en', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }), capacity: 30, remaining: 30 })
  }
  return result
}
export type Drop = ReturnType<typeof nextDrops>[number]
export type Ticket = { token: string; tag: string; name: string; phone: string; scheduleId: string; cart: Cart; total: number; status: 'pending_payment' | 'pending_review' | 'confirmed' | 'ready' | 'collected' | 'rejected'; packed: boolean; notified: boolean; createdAt: string; receiptId?: string; photoUrl?: string; expiresAt?: string }
export function cartSummary(cart: Cart) { return products.filter(p => cart[p.id]).map(p => `${cart[p.id]} × ${p.name} (${p.size})`).join(', ') }
