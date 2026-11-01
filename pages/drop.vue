<script setup lang="ts">
import { Ticket as TicketIcon, MapPin, CalendarDays, PackageCheck, Copy, ArrowRight, RefreshCw, Check, ChevronRight, ArrowLeft, History } from 'lucide-vue-next'
import { money, products, bottleCount, type Ticket } from '~/shared/domain'
const route = useRoute()
const shop = useShop()
const ticket = ref<Ticket | null>(null)
const ticketItems = computed(() => ticket.value?.items ?? products.filter(product => ticket.value?.cart[product.id]).map(product => ({ productId: product.id, name: product.name, size: product.size, quantity: ticket.value!.cart[product.id], unitPrice: product.price })))
const loading = ref(true)
const error = ref('')
const busy = ref(false)
const confirmCollect = ref(false)
const history = computed(() => [...shop.tickets.value].sort((a, b) => b.createdAt.localeCompare(a.createdAt)))
const historyDate = (date: string) => new Date(`${date}T00:00:00Z`).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
const labels = { pending_payment: 'AWAITING RECEIPT', pending_review: 'RECEIPT UNDER REVIEW', confirmed: 'PAYMENT CONFIRMED', ready: 'READY FOR PICKUP', collected: 'COLLECTED — THANK YOU', rejected: 'PAYMENT NEEDS ATTENTION' }
const dateLabel = computed(() => ticket.value ? new Date(`${ticket.value.scheduleId}T00:00:00Z`).toLocaleDateString('en-MY', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }) : '')
async function loadTicket() {
  loading.value = true; error.value = ''; shop.load()
  const token = String(route.query.t || '')
  ticket.value = null
  confirmCollect.value = false
  try { await shop.refreshTickets() } catch { error.value = 'Could not refresh your transactions. Please try again.' }
  if (!token) { loading.value = false; return }
  try { ticket.value = shop.demo ? shop.tickets.value.find(t => t.token === token) || null : await $fetch<Ticket>(`/api/orders/${encodeURIComponent(token)}`) }
  catch (e: any) { error.value = e.data?.message || 'Could not load this ticket. Check the link or try again.' }
  finally { loading.value = false }
}
let poll: ReturnType<typeof setInterval> | undefined
onMounted(() => { loadTicket(); if (!shop.demo) poll = setInterval(() => { if (!busy.value && !document.hidden) loadTicket() }, 20000) })
onBeforeUnmount(() => clearInterval(poll))
watch(() => route.query.t, () => { if (import.meta.client) loadTicket() })
async function collect() {
  if (!ticket.value) return
  busy.value = true; error.value = ''
  try {
    if (shop.demo) { ticket.value.status = 'collected'; const saved = shop.tickets.value.find(t => t.token === ticket.value!.token); if (saved) saved.status = 'collected'; shop.persist() }
    else ticket.value = await $fetch<Ticket>(`/api/orders/${ticket.value.token}`, { method: 'PATCH', body: { action: 'collect' } })
    confirmCollect.value = false; shop.notify('Collected. Enjoy your little refresh!')
  } catch (e: any) { error.value = e.data?.message || 'Could not confirm collection. Please retry.' } finally { busy.value = false }
}
async function copyLink() { try { await navigator.clipboard.writeText(`${location.origin}/drop?t=${ticket.value!.token}`); shop.notify('Private ticket link copied. Keep it safe.') } catch { shop.notify('Copy the link from your address bar.') } }
</script>
<template>
  <div class="inner-page" :aria-busy="loading || busy"><span class="eyebrow">{{ route.query.t ? 'A BOTTLE WITH YOUR NAME ON IT' : 'YOUR REFRESH, ON RECORD' }}</span><h1 class="page-title">{{ route.query.t ? 'Your little refresh.' : 'Past transactions.' }}</h1><p class="page-subtitle">{{ route.query.t ? 'All the details. One handy ticket.' : 'A little history of your favourite workday ritual.' }}</p><NuxtLink v-if="route.query.t" to="/drop" class="history-back"><ArrowLeft aria-hidden="true" :size="13" />All transactions</NuxtLink><p v-if="loading" class="helper">{{ route.query.t ? 'Finding your bottle…' : 'Loading your transactions…' }}</p><p v-if="error" class="error" role="alert">{{ error }}</p>
    <template v-if="ticket"><article class="ticket-card"><div class="ticket-top"><span class="eyebrow" style="justify-content:center">{{ shop.demo ? 'DEMO PICKUP TICKET' : 'YOUR PICKUP TICKET' }}</span><div class="ticket-tag">{{ ticket.tag }}</div><div class="ticket-name">{{ ticket.name }}’s little refresh</div><p v-if="ticket.varietyName" class="ticket-variety">{{ ticket.varietyName }}</p><span class="status-pill">{{ labels[ticket.status] }}</span></div><div class="ticket-details"><div class="detail-row"><CalendarDays aria-hidden="true" :size="18"/><div><strong>{{ dateLabel }}</strong><span>Collect from 9:00 AM, once your ticket says ready.</span></div></div><div class="detail-row"><MapPin aria-hidden="true" :size="18"/><div><strong>Level 7 pantry freezer</strong><span>Look for the paper bag with your tag.<br>Keep frozen until you’re ready to enjoy.</span></div></div><div class="ticket-items"><div v-for="p in ticketItems" :key="p.productId" class="ticket-item"><span>{{ p.quantity }} × {{ p.name }} <small>({{ p.size }})</small></span><strong>{{ money(p.unitPrice * p.quantity) }}</strong></div><div class="ticket-total"><span>Total</span><span>{{ money(ticket.total) }}</span></div></div></div></article>
      <img v-if="ticket.photoUrl" :src="ticket.photoUrl" alt="Your drop in the Level 7 pantry freezer" class="freezer-photo"/>
      <p v-if="ticket.status === 'pending_review'" class="ticket-note">Your receipt is awaiting the operator’s check. Refresh this ticket for updates. Your bottle is ready to collect only after the pantry drop.</p><p v-if="ticket.status === 'confirmed'" class="ticket-note">Payment checked. Next stop: the pantry freezer. Your ticket will update when your bottle is ready.</p><p v-if="ticket.status === 'rejected'" class="error">The operator could not verify this payment. Contact the pantry operator with your tag before placing another order.</p><p v-if="ticket.status === 'collected'" class="ticket-note">All picked up. Thaw in the fridge, give it a good shake, and enjoy cold. See you at the next drop.</p>
      <button v-if="ticket.status === 'ready'" class="collection-button" @click="error = ''; confirmCollect = true"><PackageCheck aria-hidden="true" :size="18"/>I’VE PICKED UP MY BOTTLE</button>
      <ConfirmDialog :open="confirmCollect" title="Got your bag in hand?" :description="`Confirm only after taking bag ${ticket.tag} from the freezer. Your order will be marked as collected.`" :destructive="false" confirm-label="Yes, picked up" cancel-label="Not yet" :busy="busy" :error="error" @confirm="collect" @update:open="confirmCollect = $event" />
      <div class="ticket-links"><button @click="copyLink"><Copy aria-hidden="true" :size="13"/>Save private link</button><button @click="loadTicket"><RefreshCw aria-hidden="true" :size="13"/>Refresh status</button></div>
    </template>
    <section v-if="!route.query.t && history.length" class="transaction-history" aria-label="Past transactions">
      <div class="section-heading"><span class="subtle">{{ history.length }} transaction{{ history.length === 1 ? '' : 's' }}</span><button class="text-button" :disabled="loading" @click="loadTicket"><RefreshCw aria-hidden="true" :size="12" />Refresh</button></div>
      <NuxtLink v-for="order in history" :key="order.token" :to="`/drop?t=${order.token}`" class="transaction-card">
        <div class="transaction-card-top"><span class="transaction-tag"><TicketIcon aria-hidden="true" :size="13" />{{ order.tag }}</span><span :class="['transaction-status', order.status]">{{ labels[order.status] }}</span></div>
        <div class="transaction-card-main"><div><strong>{{ historyDate(order.scheduleId) }}</strong><span>{{ order.varietyName ? `${order.varietyName} · ` : '' }}{{ bottleCount(order.cart) }} bottle{{ bottleCount(order.cart) === 1 ? '' : 's' }} · Level 7 pantry</span></div><b>{{ money(order.total) }}</b></div>
        <div class="transaction-card-foot"><span>View pickup ticket</span><ChevronRight aria-hidden="true" :size="14" /></div>
      </NuxtLink>
    </section>
    <div v-else-if="!loading && !ticket && (!history.length || route.query.t)" class="empty-state"><History aria-hidden="true" :size="42" :stroke-width="1.2"/><h2>{{ route.query.t ? 'Ticket not found.' : 'Your first drop awaits.' }}</h2><p>{{ route.query.t ? 'Check your ticket link or return to your transactions.' : 'Order a bottle and your transactions will appear here.' }}</p><NuxtLink class="primary" to="/">Find my refresh<ArrowRight aria-hidden="true" :size="16"/></NuxtLink></div>
  </div>
</template>
