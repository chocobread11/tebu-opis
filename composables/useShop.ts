import { migrateStoredTicket } from '~/shared/legacy-products'
import { dailyBottleCapacity, dailyBottleStandard, availableBottles, boxAvailability, publicDeliveryDays, products, emptyCart, total, type Ticket, type Cart, type Drop, type Product, type CaneStock, type CalendarDay, demoVarieties, malaysiaToday, defaultMonthSchedules, describeDrop, activeOrderingWeek, testingOrderingWindow, type ActiveWeek } from '~/shared/domain'

export function useShop() {
  const config = useRuntimeConfig()
  const demo = config.public.demo === true || String(config.public.demo) === 'true'
  const testing = String(config.public.testingCalendar) === 'true'
  // Production: activeOrderingWeek() and defaultMonthSchedules().
  const orderingWindow = () => testing ? testingOrderingWindow() : activeOrderingWeek()
  const demoDates = () => testing ? orderingWindow().days.map(id => ({ id })) : defaultMonthSchedules()
  const catalog = useState<Product[]>('catalog', () => demo ? products : [])
  const catalogLoaded = useState('catalog-loaded', () => false)
  const week = useState<ActiveWeek>('active-ordering-week', orderingWindow)
  const days = useState<CalendarDay[]>('calendar-days', () => demo ? demoDates().map(day => ({ ...day, open: true, capacity: dailyBottleCapacity, remaining: dailyBottleCapacity, kecikCapacity: dailyBottleStandard.kecik, besarCapacity: dailyBottleStandard.besar })) : [])
  const varieties = useState<CaneStock[]>('cane-varieties', () => demo ? demoVarieties.map(v => ({ ...v })) : [])
  const varietyId = useState<string>('selected-variety', () => demo ? 'tebu-1' : '')
  const variety = computed(() => varieties.value.find(row => row.id === varietyId.value))
  const cart = useState<Cart>('cart', emptyCart)
  const drops = useState<Drop[]>('drops', () => demo ? demoDates().filter(day => day.id >= week.value.start && day.id <= week.value.end).map(day => describeDrop(day.id)) : [])
  const selected = useState('selected', () => drops.value[0]?.id || '')
  const tickets = useState<Ticket[]>('tickets', () => [])
  const customerToken = useState('customerToken', () => '')
  const customerName = useState('customerName', () => '')
  const customerPhone = useState('customerPhone', () => '')
  const checkoutOpen = useState('checkoutOpen', () => false)
  const checkoutDraft = useState<Ticket | null>('checkoutDraft', () => null)
  const toast = useState('toast', () => '')
  function notify(message: string) { toast.value = message; setTimeout(() => { toast.value = '' }, 4000) }
  function persist() {
    if (!import.meta.client || !demo) return
    let latest: Ticket[] = []
    try { latest = JSON.parse(localStorage.getItem('tebu_demo_orders') || '[]').map(migrateStoredTicket) } catch { /* Start with this device's current orders. */ }
    const incoming = new Map(tickets.value.map(ticket => [ticket.token, ticket]))
    const merged = latest.map(stored => {
      const update = incoming.get(stored.token)
      incoming.delete(stored.token)
      if (!update) return stored
      // Customer writes can submit receipts and confirm pickup, but must not undo admin packing/drop changes.
      const status = update.status === 'pending_review' && stored.status === 'pending_payment' ? 'pending_review'
        : update.status === 'collected' && ['ready', 'collected'].includes(stored.status) ? 'collected' : stored.status
      return { ...update, ...stored, status }
    })
    tickets.value = [...incoming.values(), ...merged]
    localStorage.setItem('tebu_demo_orders', JSON.stringify(tickets.value))
  }
  function load() {
    if (!import.meta.client) return
    // Live authentication is held by an HttpOnly cookie, never browser storage.
    customerToken.value = ''
    localStorage.removeItem('customer_token')
    customerName.value = localStorage.getItem('customer_name') || ''
    customerPhone.value = localStorage.getItem('customer_phone') || ''
    if (demo) { try { tickets.value = JSON.parse(localStorage.getItem('tebu_demo_orders') || '[]').map(migrateStoredTicket) } catch { tickets.value = [] } }
  }
  function available(id: keyof Cart) {
    if (id !== 'kecik' && id !== 'besar') return 10
    const day = days.value.find(day => day.id === selected.value)
    if (!day?.open || day.removedAt || day.droppedAt) return 0
    return availableBottles(id, day.remaining, cart.value, id === 'kecik' ? variety.value?.kecikRemaining ?? 0 : variety.value?.besarRemaining ?? 0)
  }
  function change(id: keyof Cart, delta: number) { cart.value[id] = Math.max(0, Math.min(available(id), cart.value[id] + delta)) }
  function syncDemoCalendar() {
    load()
    week.value = orderingWindow()
    days.value = days.value.map(day => {
      const reserved = tickets.value.filter(ticket => ticket.scheduleId === day.id && ticket.status !== 'rejected' && (ticket.status !== 'pending_payment' || !!ticket.expiresAt && new Date(ticket.expiresAt).getTime() > Date.now()))
      const kecikUsed = reserved.reduce((sum, ticket) => sum + ticket.cart.kecik, 0)
      const besarUsed = reserved.reduce((sum, ticket) => sum + ticket.cart.besar, 0)
      return { ...day, ...boxAvailability(day.capacity, { kecik: kecikUsed, besar: besarUsed }) }
    })
    drops.value = publicDeliveryDays(days.value, week.value, new Date(), testing).filter(day => day.open && !day.removedAt && !day.droppedAt).map(day => describeDrop(day.id, day.capacity, day.remaining))
    if (!drops.value.some(day => day.id === selected.value)) selected.value = drops.value.find(day => day.remaining > 0)?.id || drops.value[0]?.id || ''
  }
  async function refreshDrops() {
    if (demo) { syncDemoCalendar(); return }
    const data = await $fetch<{ week: ActiveWeek; days: CalendarDay[]; varieties: CaneStock[]; drops: Drop[]; products: Product[] }>('/api/catalog')
    const changedWeek = data.week.start !== week.value.start
    week.value = data.week
    days.value = data.days; varieties.value = data.varieties; drops.value = data.drops; catalog.value = data.products
    if (!varieties.value.some(row => row.id === varietyId.value)) varietyId.value = varieties.value.find(row => row.kecikRemaining + row.besarRemaining > 0)?.id || varieties.value[0]?.id || ''
    if (!drops.value.some(d => d.id === selected.value)) selected.value = (!catalogLoaded.value || changedWeek) ? drops.value.find(day => day.remaining > 0)?.id || drops.value[0]?.id || '' : ''
    catalogLoaded.value = true
  }
  async function refreshTickets() {
    load()
    if (!demo && customerPhone.value) {
      const phone = customerPhone.value
      try {
        const data = await $fetch<{ orders: Ticket[] }>('/api/orders')
        if (customerPhone.value !== phone) return
        tickets.value = data.orders
      } catch (e: any) {
        if (customerPhone.value !== phone) return
        if (e?.status === 401 || e?.statusCode === 401) {
          customerToken.value = ''; customerName.value = ''
          tickets.value = []
          localStorage.removeItem('customer_token'); localStorage.removeItem('customer_name')
        }
        throw e
      }
    }
  }
  const activeTicket = computed(() => tickets.value.find(t => (!demo || t.phone === customerPhone.value) && !['collected', 'rejected'].includes(t.status)))
  const amount = computed(() => total(cart.value, catalog.value))
  return { demo, week, days, varieties, varietyId, variety, available, syncDemoCalendar, cart, drops, selected, tickets, customerToken, customerName, customerPhone, checkoutOpen, checkoutDraft, toast, activeTicket, amount, change, notify, persist, load, refreshDrops, refreshTickets, get products() { return catalog.value } }
}
