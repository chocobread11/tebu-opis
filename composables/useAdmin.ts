import { defaultWhatsAppOpening } from '~/shared/whatsapp'
import { demoInventory } from '~/shared/demo-inventory'
import { migrateStoredTicket } from '~/shared/legacy-products'
import { demoVarieties, malaysiaToday, type Product, type CalendarDay, type CaneStock, type Ticket } from '~/shared/domain'

export function useAdmin() {
  const shop = useShop()
  const whatsappOpening = useState('whatsapp-opening', () => defaultWhatsAppOpening)
  const local = shop.demo
  const products = useState<Product[]>('admin-product-catalog', () => local ? shop.products : [])
  const orders = useState<Ticket[]>('admin-orders', () => [])
  const schedules = useState<CalendarDay[]>('admin-schedules', () => [])
  const varieties = useState<CaneStock[]>('admin-varieties', () => local ? demoVarieties.map(v => ({ ...v })) : [])
  const adminKey = useState('admin-key', () => '')
  const authenticated = useState('admin-authenticated', () => false)
  const headers = computed(() => { const value: Record<string, string> = {}; if (adminKey.value) value.Authorization = `Bearer ${adminKey.value}`; return value })
  const revision = useState('admin-revision', () => 0)
  const snapshot = useState<Record<string, Ticket>>('admin-demo-snapshot', () => ({}))
  function invalidate() { revision.value++ }

  function persist() {
    if (!import.meta.client || !local) return
    // Both views read one authoritative demo snapshot, including fixture tickets.
    let latest: Ticket[] = []
    try { latest = JSON.parse(localStorage.getItem('tebu_demo_orders') || '[]').map(migrateStoredTicket) } catch { /* Use the current session's records. */ }
    const stored = new Map(latest.map(ticket => [ticket.token, ticket]))
    orders.value = orders.value.map(order => {
      const current = stored.get(order.token)
      stored.delete(order.token)
      const previous = snapshot.value[order.token]
      if (!current || !previous) return current?.status === 'collected' ? { ...order, status: 'collected' as const } : order
      const merged = { ...current }
      for (const field of ['status', 'packed', 'notified', 'photoUrl', 'manualPaymentStatus', 'phone', 'remarks'] as const) {
        if (order[field] !== previous[field]) Object.assign(merged, { [field]: order[field] })
      }
      if (current.status === 'collected') merged.status = 'collected'
      return merged
    })
    orders.value.push(...stored.values())
    snapshot.value = Object.fromEntries(orders.value.map(order => [order.token, { ...order, cart: { ...order.cart } }]))
    shop.tickets.value = orders.value.map(order => ({ ...order, cart: { ...order.cart } }))
    localStorage.setItem('tebu_admin_orders', JSON.stringify(orders.value))
    localStorage.setItem('tebu_demo_orders', JSON.stringify(shop.tickets.value))
  }

  async function signIn() {
    if (local) { await refresh(); adminKey.value = ''; return }
    try { await $fetch('/api/admin/session', { method: 'POST', headers: headers.value, body: {} }) }
    finally { adminKey.value = '' }
    await refresh()
  }
  async function restore() {
    if (local) return false
    try { await refresh(); return true } catch { return false }
  }
  async function logout() {
    if (!local) await $fetch('/api/admin/session/logout', { method: 'POST', body: {} })
    invalidate(); adminKey.value = ''; authenticated.value = false
    orders.value = []; schedules.value = []; products.value = []; varieties.value = []
  }
  async function refresh() {
    if (!local) {
      const request = ++revision.value
      try {
        const data = await $fetch<{ orders: Ticket[]; schedules: CalendarDay[]; varieties: CaneStock[]; products: Product[]; whatsappOpening: string }>('/api/admin', { headers: headers.value })
        if (request !== revision.value) return
        orders.value = data.orders
        schedules.value = data.schedules.map(row => ({ ...row, remaining: row.capacity }))
        varieties.value = data.varieties
        products.value = data.products
        whatsappOpening.value = data.whatsappOpening
        authenticated.value = true
      } catch (error: any) {
        if (request !== revision.value) return
        if (error.statusCode === 401 || error.status === 401) { authenticated.value = false; orders.value = []; schedules.value = [] }
        throw error
      }
      return
    }
    shop.load()
    whatsappOpening.value = localStorage.getItem('tebu_whatsapp_opening') || defaultWhatsAppOpening
    products.value = demoInventory(JSON.parse(localStorage.getItem('tebu_demo_products') || 'null'), JSON.parse(localStorage.getItem('tebu_demo_stock') || '[]'), shop.tickets.value).products
    try { orders.value = JSON.parse(localStorage.getItem('tebu_admin_orders') || '[]').map(migrateStoredTicket) } catch { orders.value = [] }
    for (const ticket of shop.tickets.value) {
      const existing = orders.value.find(order => order.token === ticket.token)
      if (existing) Object.assign(existing, ticket)
      else orders.value.unshift({ ...ticket, cart: { ...ticket.cart } })
    }
    const fixturePhones: Record<string, string> = { 'demo-amirul': '60100000001', 'demo-nadia': '60100000002', 'demo-wei': '60100000003' }
    for (const order of orders.value) if (!order.phone && fixturePhones[order.token]) order.phone = fixturePhones[order.token]!
    const today = malaysiaToday()
    const samplePhoto = '/images/demo-freezer-drop.svg'
    const fixtureStates: Record<string, Partial<Ticket>> = {
      'demo-amirul': { scheduleId: today, status: 'confirmed', packed: true, notified: false },
      'demo-nadia': { scheduleId: today, status: 'ready', packed: true, notified: true, photoUrl: samplePhoto },
      'demo-wei': { scheduleId: today, status: 'collected', packed: true, notified: true, photoUrl: samplePhoto },
    }
    for (const order of orders.value) Object.assign(order, fixtureStates[order.token] || {})
    for (const ticket of shop.tickets.value) Object.assign(ticket, fixtureStates[ticket.token] || {})
    if (!orders.value.length) {
      const scheduleId = today
      const createdAt = new Date().toISOString()
      orders.value = [
        { token: 'demo-amirul', tag: '#A01', name: 'Amirul', phone: '60100000001', scheduleId, cart: { kecik: 2, besar: 0, asam: 1, limau: 0 }, total: 1300, status: 'confirmed', packed: true, notified: false, createdAt },
        { token: 'demo-nadia', tag: '#A02', name: 'Nadia', phone: '60100000002', scheduleId, cart: { kecik: 0, besar: 1, asam: 0, limau: 1 }, total: 1200, status: 'ready', packed: true, notified: true, photoUrl: samplePhoto, createdAt },
        { token: 'demo-wei', tag: '#A03', name: 'Wei', phone: '60100000003', scheduleId, cart: { kecik: 1, besar: 0, asam: 0, limau: 0 }, total: 600, status: 'collected', packed: true, notified: true, photoUrl: samplePhoto, createdAt },
      ]
    }
    authenticated.value = true
    persist()
  }

  return { products, whatsappOpening, local, orders, schedules, varieties, adminKey, authenticated, headers, persist, refresh, invalidate, signIn, restore, logout }
}
