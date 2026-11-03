<script setup lang="ts">
import { Ticket as TicketIcon, MapPin, CalendarDays, PackageCheck, Copy, ArrowRight, RefreshCw, Check, ChevronRight, ArrowLeft, History } from '~/lib/icons'
import { money, products, ticketStatusLabel, type Ticket } from '~/shared/domain'
const route = useRoute()
const shop = useShop()
const ticket = ref<Ticket | null>(null)
const ticketItems = computed(() => ticket.value?.items ?? products.filter(product => ticket.value?.cart[product.id]).map(product => ({ productId: product.id, name: product.name, size: product.size, quantity: ticket.value!.cart[product.id], unitPrice: product.price })))
const loading = ref(true)
const error = ref('')
const busy = ref(false)
const confirmCollect = ref(false)
const dateLabel = computed(() => ticket.value ? new Date(`${ticket.value.scheduleId}T00:00:00Z`).toLocaleDateString('en-MY', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }) : '')
let requestVersion = 0
async function loadTicket(silent = false) {
  const version = ++requestVersion
  if (!silent) { loading.value = true; error.value = ''; ticket.value = null; confirmCollect.value = false }
  const token = String(route.query.t || '')
  if (!token) { loading.value = false; return }
  try {
    shop.load()
    const current = shop.demo ? shop.tickets.value.find(t => t.token === token) || null : await $fetch<Ticket>(`/api/orders/${encodeURIComponent(token)}`)
    if (version === requestVersion && String(route.query.t || '') === token) ticket.value = current
  } catch (e: any) { if (!silent && version === requestVersion) error.value = e.data?.message || 'Could not load this ticket. Check the link or try again.' }
  finally { if (version === requestVersion) loading.value = false }
}
function onVisible() { if (!document.hidden && !busy.value && route.query.t) loadTicket(true) }
function onStorage(event: StorageEvent) { if (event.key === 'tebu_demo_orders' && !busy.value && route.query.t) loadTicket(true) }
let poll: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  loadTicket()
  poll = setInterval(onVisible, 5000)
  document.addEventListener('visibilitychange', onVisible)
  window.addEventListener('storage', onStorage)
})
onBeforeUnmount(() => { requestVersion++; clearInterval(poll); document.removeEventListener('visibilitychange', onVisible); window.removeEventListener('storage', onStorage) })
watch(() => route.query.t, () => { if (import.meta.client) loadTicket() })
watch(shop.checkoutOpen, open => { if (!open && route.query.t) loadTicket() })
function resumeReceipt() {
  if (!ticket.value) return
  shop.checkoutDraft.value = ticket.value
  shop.checkoutOpen.value = true
}
async function collect() {
  if (!ticket.value) return
  requestVersion++
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
  <div class="inner-page" :aria-busy="loading || busy"><span class="eyebrow">{{ route.query.t ? 'A BOTTLE WITH YOUR NAME ON IT' : 'YOUR REFRESH, ON RECORD' }}</span><h1 class="page-title">{{ route.query.t ? 'Your order receipt.' : 'Past transactions.' }}</h1><p class="page-subtitle">{{ route.query.t ? 'All the details. One handy ticket.' : 'Find your orders and receipts using your mobile number.' }}</p><NuxtLink v-if="route.query.t" to="/drop" class="history-back"><ArrowLeft aria-hidden="true" :size="13" />All transactions</NuxtLink><p v-if="loading" class="helper">{{ route.query.t ? 'Finding your bottle…' : 'Loading your transactions…' }}</p><p v-if="error" class="error" role="alert">{{ error }}</p>
    <template v-if="ticket"><article class="ticket-card"><div class="ticket-top"><span class="eyebrow" style="justify-content:center">{{ shop.demo ? 'DEMO PICKUP TICKET' : 'YOUR PICKUP TICKET' }}</span><div class="ticket-tag">{{ ticket.tag }}</div><div class="ticket-name">{{ ticket.name }}’s little refresh</div><p v-if="ticket.varietyName" class="ticket-variety">{{ ticket.varietyName }}</p><span class="status-pill">{{ ticketStatusLabel(ticket).toUpperCase() }}</span></div><div class="ticket-details"><div class="detail-row"><CalendarDays aria-hidden="true" :size="18"/><div><strong>{{ dateLabel }}</strong><span>Collect from 9:00 AM, once your ticket says ready.</span></div></div><div class="detail-row"><MapPin aria-hidden="true" :size="18"/><div><strong>Level 7 pantry freezer</strong><span>Look for the paper bag with your tag.<br>Keep frozen until you’re ready to enjoy.</span></div></div><div class="ticket-items"><div v-for="p in ticketItems" :key="p.productId" class="ticket-item"><span>{{ p.quantity }} × {{ p.name }} <small>({{ p.size }})</small></span><strong>{{ money(p.unitPrice * p.quantity) }}</strong></div><div class="ticket-total"><span>Total</span><span>{{ money(ticket.total) }}</span></div></div></div></article>
      <img v-if="ticket.photoUrl" :src="ticket.photoUrl" alt="Your drop in the Level 7 pantry freezer" class="freezer-photo"/>
      <template v-if="ticket.status === 'pending_payment'"><p class="ticket-note">Your order is awaiting a payment receipt. Upload the receipt after paying to submit it for verification.</p><button class="primary" @click="resumeReceipt">Upload payment receipt</button></template>
      <p v-if="ticket.status === 'pending_review'" class="ticket-note">Your receipt is awaiting the operator’s check. Refresh this ticket for updates. Your bottle is ready to collect only after the pantry drop.</p><p v-if="ticket.status === 'confirmed'" class="ticket-note">{{ ticket.packed ? 'Your order is packed. We’ll update this ticket when it reaches the pantry freezer.' : 'Payment checked. Your order is waiting to be packed.' }}</p><p v-if="ticket.status === 'rejected'" class="error">The operator could not verify this payment. Contact the pantry operator with your tag before placing another order.</p><p v-if="ticket.status === 'collected'" class="ticket-note">All picked up. Thaw in the fridge, give it a good shake, and enjoy cold. See you at the next drop.</p>
      <button v-if="ticket.status === 'ready'" class="collection-button" @click="error = ''; confirmCollect = true"><PackageCheck aria-hidden="true" :size="18"/>I’VE PICKED UP MY BOTTLE</button>
      <ConfirmDialog :open="confirmCollect" title="Got your bag in hand?" :description="`Confirm only after taking bag ${ticket.tag} from the freezer. Your order will be marked as collected.`" :destructive="false" confirm-label="Yes, picked up" cancel-label="Not yet" :busy="busy" :error="error" @confirm="collect" @update:open="confirmCollect = $event" />
      <div class="ticket-links"><button @click="copyLink"><Copy aria-hidden="true" :size="13"/>Save private link</button><button @click="loadTicket()"><RefreshCw aria-hidden="true" :size="13"/>Refresh status</button></div>
    </template>
    <TransactionHistory v-if="!route.query.t" />
    <div v-else-if="!loading && !ticket" class="empty-state"><History aria-hidden="true" :size="42"/><h2>Ticket not found.</h2><p>Check your ticket link or return to your transactions.</p><NuxtLink class="primary" to="/drop">Find my transactions</NuxtLink></div>
  </div>
</template>
