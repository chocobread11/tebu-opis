<script setup lang="ts">
import { Ticket as TicketIcon, MapPin, CalendarDays, ShoppingBag, PackageCheck, Copy, ArrowRight, RefreshCw, Check } from 'lucide-vue-next'
import { money, products, nextDrops, type Ticket } from '~/shared/domain'
const route = useRoute()
const shop = useShop()
const ticket = ref<Ticket | null>(null)
const loading = ref(true)
const error = ref('')
const busy = ref(false)
const confirmCollect = ref(false)
const labels = { pending_payment: 'AWAITING RECEIPT', pending_review: 'RECEIPT UNDER REVIEW', confirmed: 'PAYMENT CONFIRMED', ready: 'READY FOR PICKUP', collected: 'COLLECTED — THANK YOU', rejected: 'PAYMENT NEEDS ATTENTION' }
const dateLabel = computed(() => ticket.value ? new Date(`${ticket.value.scheduleId}T00:00:00Z`).toLocaleDateString('en-MY', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }) : '')
async function loadTicket() {
  loading.value = true; error.value = ''; shop.load()
  const token = String(route.query.t || localStorage.getItem('tebu_latest_ticket') || '')
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
  <div class="inner-page"><span class="eyebrow">A BOTTLE WITH YOUR NAME ON IT</span><h1 class="page-title">Your little refresh.</h1><p class="page-subtitle">All the details. One handy ticket.</p><p v-if="loading" class="helper">Finding your bottle…</p><p v-if="error" class="error" role="alert">{{ error }}</p>
    <template v-if="ticket"><article class="ticket-card"><div class="ticket-top"><span class="eyebrow" style="justify-content:center">{{ shop.demo ? 'DEMO PICKUP TICKET' : 'YOUR PICKUP TICKET' }}</span><div class="ticket-tag">{{ ticket.tag }}</div><div class="ticket-name">{{ ticket.name }}’s little refresh</div><span class="status-pill">{{ labels[ticket.status] }}</span></div><div class="ticket-details"><div class="detail-row"><CalendarDays :size="18"/><div><strong>{{ dateLabel }}</strong><span>Collect from 9:00 AM, once your ticket says ready.</span></div></div><div class="detail-row"><MapPin :size="18"/><div><strong>Level 7 pantry freezer</strong><span>Look for the paper bag with your tag.<br>Keep frozen until you’re ready to enjoy.</span></div></div><div class="ticket-items"><div v-for="p in products.filter(p => ticket!.cart[p.id])" :key="p.id" class="ticket-item"><span>{{ ticket.cart[p.id] }} × {{ p.name }} <small>({{ p.size }})</small></span><strong>{{ money(p.price * ticket.cart[p.id]) }}</strong></div><div class="ticket-total"><span>Total</span><span>{{ money(ticket.total) }}</span></div></div></div></article>
      <img v-if="ticket.photoUrl" :src="ticket.photoUrl" alt="Your drop in the Level 7 pantry freezer" class="freezer-photo"/>
      <p v-if="ticket.status === 'pending_review'" class="ticket-note">Your receipt is awaiting the operator’s check. Refresh this ticket for updates. Your bottle is ready to collect only after the pantry drop.</p><p v-if="ticket.status === 'confirmed'" class="ticket-note">Payment checked. Next stop: the pantry freezer. Your ticket will update when your bottle is ready.</p><p v-if="ticket.status === 'rejected'" class="error">The operator could not verify this payment. Contact the pantry operator with your tag before placing another order.</p><p v-if="ticket.status === 'collected'" class="ticket-note">All picked up. Thaw in the fridge, give it a good shake, and enjoy cold. See you at the next drop.</p>
      <button v-if="ticket.status === 'ready' && !confirmCollect" class="collection-button" @click="confirmCollect = true"><PackageCheck :size="18"/>I’VE PICKED UP MY BOTTLE</button><div v-if="confirmCollect" class="info-card"><h3>Got your bag in hand?</h3><p>Confirm only after taking bag {{ ticket.tag }} from the freezer.</p><div class="review-actions"><button class="secondary" @click="confirmCollect = false">Not yet</button><button class="primary" :disabled="busy" @click="collect">Yes, picked up <Check :size="15"/></button></div></div>
      <div class="ticket-links"><button @click="copyLink"><Copy :size="13"/>Save private link</button><button @click="loadTicket"><RefreshCw :size="13"/>Refresh status</button></div>
    </template>
    <div v-else-if="!loading" class="empty-state"><TicketIcon :size="42" :stroke-width="1.2"/><h2>Your bottle starts here.</h2><p>Lock a bottle from the drop menu.<br>Your pickup ticket will appear right here.</p><NuxtLink class="primary" to="/">Find my refresh<ArrowRight :size="16"/></NuxtLink></div>
    <section v-if="shop.demo && shop.tickets.value.length > 1" class="ticket-history"><h2>On this device</h2><button v-for="t in shop.tickets.value.filter(t => t.token !== ticket?.token)" :key="t.token" @click="navigateTo(`/drop?t=${t.token}`)"><strong>{{ t.tag }}</strong>{{ t.scheduleId }}<small>{{ labels[t.status] }}</small></button></section>
  </div>
</template>
