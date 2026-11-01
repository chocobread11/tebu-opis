import { dailyBottleCapacity, dailyBottleStandard, publicDeliveryDays, products, emptyCart, total, type Ticket, type Cart, type Drop, type Product, type CaneStock, type CalendarDay, demoVarieties, malaysiaToday, defaultMonthSchedules, describeDrop, activeOrderingWeek, type ActiveWeek } from '~/shared/domain'

export function useShop() {
  const config = useRuntimeConfig()
  const demo = config.public.demo === true || String(config.public.demo) === 'true'
  const catalog = useState<Product[]>('catalog', () => demo ? products : [])
  const catalogLoaded = useState('catalog-loaded', () => false)
  const week = useState<ActiveWeek>('active-ordering-week', () => activeOrderingWeek())
  const days = useState<CalendarDay[]>('calendar-days', () => demo ? defaultMonthSchedules().map(day => ({ ...day, open: true, capacity: dailyBottleCapacity, remaining: dailyBottleCapacity, flaskCapacity: dailyBottleStandard.flask, jugCapacity: dailyBottleStandard.jug })) : [])
  const varieties = useState<CaneStock[]>('cane-varieties', () => demo ? demoVarieties.map(v => ({ ...v })) : [])
  const varietyId = useState<string>('selected-variety', () => demo ? 'tebu-1' : '')
  const variety = computed(() => varieties.value.find(row => row.id === varietyId.value))
  const queue = useState<{ tag: string; name: string }[]>('queue', () => [])
  const cart = useState<Cart>('cart', emptyCart)
  const drops = useState<Drop[]>('drops', () => demo ? defaultMonthSchedules().filter(day => day.id >= week.value.start && day.id <= week.value.end).map(day => describeDrop(day.id)) : [])
  const selected = useState('selected', () => drops.value[0]?.id || '')
  const tickets = useState<Ticket[]>('tickets', () => [])
  const customerToken = useState('customerToken', () => '')
  const customerName = useState('customerName', () => '')
  const checkoutOpen = useState('checkoutOpen', () => false)
  const toast = useState('toast', () => '')
  function notify(message: string) { toast.value = message; setTimeout(() => { toast.value = '' }, 4000) }
  function persist() { if (import.meta.client && demo) localStorage.setItem('tebu_demo_orders', JSON.stringify(tickets.value)) }
  function load() {
    if (!import.meta.client) return
    customerToken.value = localStorage.getItem('customer_token') || ''
    customerName.value = localStorage.getItem('customer_name') || ''
    if (demo) { try { tickets.value = JSON.parse(localStorage.getItem('tebu_demo_orders') || '[]') } catch { tickets.value = [] } }
  }
  function available(id: keyof Cart) {
    const day = days.value.find(day => day.id === selected.value)
    return id === 'flask' ? Math.max(0, Math.min(variety.value?.flaskRemaining ?? 0, day?.flaskRemaining ?? day?.flaskCapacity ?? dailyBottleStandard.flask, day?.remaining ?? dailyBottleCapacity)) : id === 'jug' ? Math.max(0, Math.min(variety.value?.jugRemaining ?? 0, day?.jugRemaining ?? day?.jugCapacity ?? dailyBottleStandard.jug, day?.remaining ?? dailyBottleCapacity)) : 10
  }
  function change(id: keyof Cart, delta: number) { cart.value[id] = Math.max(0, Math.min(10, available(id), cart.value[id] + delta)) }
  function syncDemoCalendar() {
    week.value = activeOrderingWeek()
    drops.value = publicDeliveryDays(days.value, week.value).map(day => describeDrop(day.id, day.capacity, day.remaining))
    if (!drops.value.some(day => day.id === selected.value)) selected.value = drops.value.find(day => day.remaining > 0)?.id || ''
  }
  async function refreshDrops() {
    if (demo) { syncDemoCalendar(); return }
    const data = await $fetch<{ week: ActiveWeek; days: CalendarDay[]; varieties: CaneStock[]; drops: Drop[]; products: Product[]; queue: { tag: string; name: string }[] }>('/api/catalog')
    const changedWeek = data.week.start !== week.value.start
    week.value = data.week
    days.value = data.days; varieties.value = data.varieties; drops.value = data.drops; catalog.value = data.products; queue.value = data.queue
    if (!varieties.value.some(row => row.id === varietyId.value)) varietyId.value = varieties.value.find(row => row.flaskRemaining + row.jugRemaining > 0)?.id || varieties.value[0]?.id || ''
    if (!drops.value.some(d => d.id === selected.value && d.remaining > 0)) selected.value = (!catalogLoaded.value || changedWeek) ? drops.value.find(day => day.remaining > 0)?.id || '' : ''
    catalogLoaded.value = true
  }
  async function refreshTickets() {
    load()
    if (!demo && customerToken.value) {
      try {
        const data = await $fetch<{ orders: Ticket[] }>('/api/orders', { headers: { Authorization: `Bearer ${customerToken.value}` } })
        tickets.value = data.orders
      } catch (e: any) {
        if (e?.status === 401 || e?.statusCode === 401) {
          customerToken.value = ''; customerName.value = ''
          localStorage.removeItem('customer_token'); localStorage.removeItem('customer_name')
        }
        throw e
      }
    }
  }
  const activeTicket = computed(() => tickets.value.find(t => !['collected', 'rejected'].includes(t.status)))
  const amount = computed(() => total(cart.value, catalog.value))
  return { demo, week, days, varieties, varietyId, variety, available, syncDemoCalendar, cart, drops, selected, tickets, customerToken, customerName, checkoutOpen, toast, activeTicket, amount, queue, change, notify, persist, load, refreshDrops, refreshTickets, get products() { return catalog.value } }
}
