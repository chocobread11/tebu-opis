export const dailyBottleCapacity = 12
// Maximum of either size when it alone fills the shared box.
export const dailyBottleStandard = { kecik: dailyBottleCapacity, besar: Math.floor(dailyBottleCapacity / 2) } as const
export const bottleSpaceCost = { kecik: 1, besar: 2 } as const
export type ProductId = 'kecik' | 'besar' | 'asam' | 'limau'
export type Cart = Record<ProductId, number>
export type Product = { id: ProductId; name: string; size: string; price: number; description: string; kind: string }
export const products: Product[] = [
  { id: 'kecik' as const, name: 'Botol Kecik', size: '500ml', price: 600, description: 'Kecik minum terus.', kind: 'bottle' },
  { id: 'besar' as const, name: 'Botol Besar', size: '1l', price: 1100, description: 'Bawak balik rumah.', kind: 'bottle' },
  { id: 'asam' as const, name: 'Asam Boi', size: 'pouch', price: 100, description: 'Sweet meets salty.', kind: 'addon' },
  { id: 'limau' as const, name: 'Limau Kasturi', size: 'pouch', price: 100, description: 'A fresh citrus kick.', kind: 'addon' },
]
export function emptyCart(): Cart { return { kecik: 0, besar: 0, asam: 0, limau: 0 } }
export function total(cart: Cart, catalog: Product[] = products) { return catalog.reduce((sum, p) => sum + p.price * cart[p.id], 0) }
export function bottleCount(cart: Cart) { return cart.kecik + cart.besar }
export function bottleSpaces(cart: Pick<Cart, 'kecik' | 'besar'>) { return cart.kecik * bottleSpaceCost.kecik + cart.besar * bottleSpaceCost.besar }
export function boxAvailability(capacity: number, used: Pick<Cart, 'kecik' | 'besar'>) {
  const remaining = Math.max(0, capacity - bottleSpaces(used))
  return { capacity, remaining, kecikUsed: used.kecik, besarUsed: used.besar, kecikCapacity: capacity, besarCapacity: Math.floor(capacity / 2), kecikRemaining: remaining, besarRemaining: Math.floor(remaining / 2) }
}
export function availableBottles(id: 'kecik' | 'besar', remaining: number, cart: Pick<Cart, 'kecik' | 'besar'>, stock: number) {
  const other = id === 'kecik' ? 'besar' : 'kecik'
  return Math.max(0, Math.min(stock, Math.floor((remaining - cart[other] * bottleSpaceCost[other]) / bottleSpaceCost[id])))
}
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
export type Ticket = { remarks?: string; manualPaymentStatus?: 'paid' | 'unpaid'; varietyId?: string; varietyName?: string; items?: TicketItem[]; token: string; tag: string; name: string; phone: string; scheduleId: string; cart: Cart; total: number; status: 'pending_payment' | 'pending_review' | 'confirmed' | 'ready' | 'collected' | 'rejected'; packed: boolean; notified: boolean; createdAt: string; receiptId?: string; photoUrl?: string; expiresAt?: string }
export type Expense = { id: string; date: string; amount: number; note: string }
export type Harvest = { id: string; date: string; quantity: number; type: string; varietyId?: string; kecikQty: number; besarQty: number }
export type LogData = { expenses: Expense[]; harvests: Harvest[]; revenue: number; paidOrderCount: number; varieties: CaneStock[] }
export function cartSummary(cart: Cart, catalog: Product[] = products) { return catalog.filter(p => cart[p.id]).map(p => `${cart[p.id]} × ${p.name} (${p.size})`).join(', ') }

export type CaneStock = { id: string; name: string; description: string; kecikQty: number; besarQty: number; kecikRemaining: number; besarRemaining: number }
export type CalendarDay = { id: string; open: boolean; capacity: number; remaining: number; kecikCapacity?: number; besarCapacity?: number; kecikRemaining?: number; besarRemaining?: number; kecikUsed?: number; besarUsed?: number; closedReason?: string | null; removedAt?: string | null; droppedAt?: string | null; orderCount?: number }
export const demoVarieties: CaneStock[] = [
  { id: 'tebu-1', name: 'Tebu 1', description: '', kecikQty: 30, besarQty: 20, kecikRemaining: 30, besarRemaining: 20 },
  { id: 'tebu-2', name: 'Tebu 2', description: '', kecikQty: 20, besarQty: 10, kecikRemaining: 20, besarRemaining: 10 },
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
export function testingOrderingWindow(now = new Date()): ActiveWeek {
  const today = malaysiaToday(now)
  const days = Array.from({ length: 5 }, (_, offset) => {
    const date = new Date(`${today}T00:00:00Z`)
    date.setUTCDate(date.getUTCDate() + offset)
    return date.toISOString().slice(0, 10)
  })
  const tomorrow = new Date(`${today}T00:00:00Z`)
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1)
  const short = (id: string) => new Date(`${id}T00:00:00Z`).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', timeZone: 'UTC' })
  return { start: today, end: days[4]!, restockDate: today, days, label: `${short(today)} – ${short(days[4]!)} ${days[4]!.slice(0, 4)}`, refreshAt: `${tomorrow.toISOString().slice(0, 10)}T00:00:00+08:00` }
}
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
export function publicDeliveryDays(days: CalendarDay[], week: ActiveWeek, now = new Date(), testing = false) {
  const today = malaysiaToday(now)
  if (testing) return days.filter(day => day.id >= today && day.id >= week.start && day.id <= week.end).sort((a, b) => a.id.localeCompare(b.id)).slice(0, 5)
  return days.filter(day => day.id >= week.start && day.id <= week.end && day.id > today && isOfficeWeekday(day.id) && day.open && !day.removedAt && !day.droppedAt).sort((a, b) => a.id.localeCompare(b.id))
}

/** Packing is a separate field from payment/drop status. Use it in every customer status view. */
export function ticketStatusLabel(ticket: Pick<Ticket, 'status' | 'packed'>) {
  if (ticket.status === 'confirmed' && ticket.packed) return 'Packed — awaiting pantry drop'
  return { pending_payment: 'Awaiting receipt', pending_review: 'Receipt under review', confirmed: 'Payment confirmed', ready: 'Ready for pickup', collected: 'Collected — thank you', rejected: 'Payment needs attention' }[ticket.status]
}
export function ticketWhatsAppUrl(ticket: Pick<Ticket, 'phone' | 'token' | 'name' | 'tag'>, origin: string) {
  const phone = ticket.phone.replace(/\D/g, '')
  if (!/^60\d{8,11}$/.test(phone)) return ''
  const url = new URL('/drop', origin)
  url.searchParams.set('t', ticket.token)
  const message = `Hi ${ticket.name}! Here is your Tebu Drop ticket ${ticket.tag}. Check packing, pantry drop and collection status here: ${url.toString()}`
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`
}
