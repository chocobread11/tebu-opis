export const dailyBottleStandard = { flask: 8, jug: 3 } as const
export const dailyBottleCapacity = dailyBottleStandard.flask + dailyBottleStandard.jug
export type ProductId = 'flask' | 'jug' | 'asam' | 'limau'
export type Cart = Record<ProductId, number>
export type Product = { id: ProductId; name: string; size: string; price: number; description: string; kind: string }
export const products: Product[] = [
  { id: 'flask' as const, name: 'The Everyday Flask', size: '500 ml', price: 600, description: 'Your desk-side pick-me-up.', kind: 'bottle' },
  { id: 'jug' as const, name: 'The Sharing Jug', size: '1 litre', price: 1100, description: 'A little more to go around.', kind: 'bottle' },
  { id: 'asam' as const, name: 'Asam Boi', size: '1 pouch', price: 100, description: 'Sweet meets salty.', kind: 'addon' },
  { id: 'limau' as const, name: 'Limau Kasturi', size: '1 pouch', price: 100, description: 'A fresh citrus kick.', kind: 'addon' },
]
export function emptyCart(): Cart { return { flask: 0, jug: 0, asam: 0, limau: 0 } }
export function total(cart: Cart, catalog: Product[] = products) { return catalog.reduce((sum, p) => sum + p.price * cart[p.id], 0) }
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
    result.push({ id: d.toISOString().slice(0, 10), day: d.toLocaleDateString('en', { weekday: 'short', timeZone: 'UTC' }), date: d.toLocaleDateString('en', { day: 'numeric', month: 'short', timeZone: 'UTC' }), full: d.toLocaleDateString('en', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }), capacity: dailyBottleCapacity, remaining: dailyBottleCapacity })
  }
  return result
}
export type Drop = ReturnType<typeof nextDrops>[number]
export type TicketItem = { productId: string; name: string; size: string; quantity: number; unitPrice: number }
export type Ticket = { manualPaymentStatus?: 'paid' | 'unpaid'; varietyId?: string; varietyName?: string; items?: TicketItem[]; token: string; tag: string; name: string; phone: string; scheduleId: string; cart: Cart; total: number; status: 'pending_payment' | 'pending_review' | 'confirmed' | 'ready' | 'collected' | 'rejected'; packed: boolean; notified: boolean; createdAt: string; receiptId?: string; photoUrl?: string; expiresAt?: string }
export type Expense = { id: string; date: string; amount: number; note: string }
export type Harvest = { id: string; date: string; quantity: number; type: string; varietyId?: string; flaskQty: number; jugQty: number }
export type LogData = { expenses: Expense[]; harvests: Harvest[]; revenue: number; paidOrderCount: number; varieties: CaneStock[] }
export function cartSummary(cart: Cart, catalog: Product[] = products) { return catalog.filter(p => cart[p.id]).map(p => `${cart[p.id]} × ${p.name} (${p.size})`).join(', ') }

export type CaneStock = { id: string; name: string; description: string; flaskQty: number; jugQty: number; flaskRemaining: number; jugRemaining: number }
export type CalendarDay = { id: string; open: boolean; capacity: number; remaining: number; flaskCapacity?: number; jugCapacity?: number; flaskRemaining?: number; jugRemaining?: number; closedReason?: string | null; removedAt?: string | null; droppedAt?: string | null; orderCount?: number }
export const demoVarieties: CaneStock[] = [
  { id: 'tebu-1', name: 'Tebu 1', description: '', flaskQty: 30, jugQty: 20, flaskRemaining: 30, jugRemaining: 20 },
  { id: 'tebu-2', name: 'Tebu 2', description: '', flaskQty: 20, jugQty: 10, flaskRemaining: 20, jugRemaining: 10 },
]
export function malaysiaToday(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kuala_Lumpur', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}
export function describeDrop(id: string, capacity = dailyBottleCapacity, remaining = capacity): Drop {
  const d = new Date(`${id}T00:00:00Z`)
  return { id, day: d.toLocaleDateString('en', { weekday: 'short', timeZone: 'UTC' }), date: d.toLocaleDateString('en', { day: 'numeric', month: 'short', timeZone: 'UTC' }), full: d.toLocaleDateString('en', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }), capacity, remaining }
}
export function monthDays(month: string) {
  const first = new Date(`${month}-01T00:00:00Z`)
  const offset = (first.getUTCDay() + 6) % 7
  const length = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate()
  return Array.from({ length: Math.ceil((offset + length) / 7) * 7 }, (_, i) => {
    const day = i - offset + 1
    return day < 1 || day > length ? null : `${month}-${String(day).padStart(2, '0')}`
  })
}
export function defaultMonthSchedules(now = new Date(), months = 2) {
  const today = malaysiaToday(now)
  const first = new Date(`${today.slice(0, 7)}-01T00:00:00Z`)
  const end = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + months, 1))
  const days: { id: string }[] = []
  for (const day = new Date(first); day < end; day.setUTCDate(day.getUTCDate() + 1)) {
    const id = day.toISOString().slice(0, 10)
    if (id > today && day.getUTCDay() >= 1 && day.getUTCDay() <= 4) days.push({ id })
  }
  return days
}

export type ActiveWeek = { start: string; end: string; restockDate: string; days: string[]; label: string; refreshAt: string }
/** Sunday restock opens the coming Monday–Sunday window, in Malaysia time. */
export function activeOrderingWeek(now = new Date()): ActiveWeek {
  const monday = new Date(`${malaysiaToday(now)}T00:00:00Z`)
  const weekday = monday.getUTCDay()
  monday.setUTCDate(monday.getUTCDate() + (weekday === 0 ? 1 : 1 - weekday))
  const days = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(monday); date.setUTCDate(date.getUTCDate() + i)
    return date.toISOString().slice(0, 10)
  })
  const restock = new Date(monday); restock.setUTCDate(restock.getUTCDate() - 1)
  const short = (id: string) => new Date(`${id}T00:00:00Z`).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', timeZone: 'UTC' })
  return { start: days[0]!, end: days[6]!, restockDate: restock.toISOString().slice(0, 10), days, label: `${short(days[0]!)} – ${short(days[4]!)} ${days[4]!.slice(0, 4)}`, refreshAt: `${days[6]}T00:00:00+08:00` }
}

export function isOfficeWeekday(id: string) {
  const weekday = new Date(`${id}T00:00:00Z`).getUTCDay()
  return weekday >= 1 && weekday <= 5
}
/** Public dates follow the admin calendar, with weekends always excluded. */
export function publicDeliveryDays(days: CalendarDay[], week: ActiveWeek, now = new Date()) {
  const today = malaysiaToday(now)
  return days.filter(day => day.id >= week.start && day.id <= week.end && day.id > today && isOfficeWeekday(day.id) && day.open && !day.removedAt && !day.droppedAt).sort((a, b) => a.id.localeCompare(b.id))
}
