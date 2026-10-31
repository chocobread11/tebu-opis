import { products, nextDrops, emptyCart, total, type Ticket, type Cart, type Drop } from '~/shared/domain'

export function useShop() {
  const config = useRuntimeConfig()
  const demo = config.public.demo === true || String(config.public.demo) === 'true'
  const cart = useState<Cart>('cart', emptyCart)
  const drops = useState<Drop[]>('drops', () => nextDrops())
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
  function change(id: keyof Cart, delta: number) { cart.value[id] = Math.max(0, Math.min(10, cart.value[id] + delta)) }
  async function refreshDrops() { if (!demo) { const data = await $fetch<{ drops: Drop[] }>('/api/catalog'); drops.value = data.drops; if (!drops.value.some(d => d.id === selected.value)) selected.value = drops.value[0]?.id || '' } }
  const activeTicket = computed(() => tickets.value.find(t => !['collected', 'rejected'].includes(t.status)))
  const amount = computed(() => total(cart.value))
  return { demo, cart, drops, selected, tickets, customerToken, customerName, checkoutOpen, toast, activeTicket, amount, change, notify, persist, load, refreshDrops, products }
}
