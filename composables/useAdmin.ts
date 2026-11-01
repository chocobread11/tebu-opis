import { demoVarieties, type CalendarDay, type CaneStock, type Ticket } from '~/shared/domain'

export function useAdmin() {
  const shop = useShop()
  const local = shop.demo
  const orders = useState<Ticket[]>('admin-orders', () => [])
  const schedules = useState<CalendarDay[]>('admin-schedules', () => [])
  const varieties = useState<CaneStock[]>('admin-varieties', () => local ? demoVarieties.map(v => ({ ...v })) : [])
  const adminKey = useState('admin-key', () => '')
  const authenticated = useState('admin-authenticated', () => false)
  const headers = computed(() => ({ Authorization: `Bearer ${adminKey.value}` }))

  function persist() {
    if (!import.meta.client || !local) return
    localStorage.setItem('tebu_admin_orders', JSON.stringify(orders.value))
    if (shop.demo) {
      for (const ticket of shop.tickets.value) {
        const updated = orders.value.find(order => order.token === ticket.token)
        if (updated) Object.assign(ticket, updated)
      }
      shop.persist()
    }
  }

  async function refresh() {
    if (!local) {
      try {
        const data = await $fetch<{ orders: Ticket[]; schedules: CalendarDay[]; varieties: CaneStock[] }>('/api/admin', { headers: headers.value })
        orders.value = data.orders
        schedules.value = data.schedules.map(row => ({ ...row, remaining: row.capacity }))
        varieties.value = data.varieties
        authenticated.value = true
      } catch (error: any) {
        if (error.statusCode === 401 || error.status === 401) { authenticated.value = false; orders.value = []; schedules.value = [] }
        throw error
      }
      return
    }
    shop.load()
    if (!orders.value.length) {
      try { orders.value = JSON.parse(localStorage.getItem('tebu_admin_orders') || '[]') } catch { orders.value = [] }
    }
    for (const ticket of shop.tickets.value) {
      const existing = orders.value.find(order => order.token === ticket.token)
      if (existing) Object.assign(existing, ticket)
      else orders.value.unshift({ ...ticket, cart: { ...ticket.cart } })
    }
    if (!orders.value.length) {
      const scheduleId = shop.selected.value || shop.drops.value[0]?.id || ''
      const createdAt = new Date().toISOString()
      orders.value = [
        { token: 'demo-amirul', tag: '#A01', name: 'Amirul', phone: '', scheduleId, cart: { flask: 2, jug: 0, asam: 1, limau: 0 }, total: 1300, status: 'confirmed', packed: false, notified: false, createdAt },
        { token: 'demo-nadia', tag: '#A02', name: 'Nadia', phone: '', scheduleId, cart: { flask: 0, jug: 1, asam: 0, limau: 1 }, total: 1200, status: 'confirmed', packed: false, notified: false, createdAt },
        { token: 'demo-wei', tag: '#A03', name: 'Wei', phone: '', scheduleId, cart: { flask: 1, jug: 0, asam: 0, limau: 0 }, total: 600, status: 'pending_review', packed: false, notified: false, createdAt },
      ]
    }
    authenticated.value = true
    persist()
  }

  return { local, orders, schedules, varieties, adminKey, authenticated, headers, persist, refresh }
}
