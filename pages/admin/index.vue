<script setup lang="ts">
import { Backpack, Snowflake, ShoppingBag, Check, UploadCloud, MessageCircle, RefreshCw, LogOut, ExternalLink, LoaderCircle } from 'lucide-vue-next'
import { products, bottleCount, cartSummary, money, type Ticket } from '~/shared/domain'
import { compressImage } from '~/utils/compress'
const shop = useShop()
const phase = ref(1)
const adminKey = ref('')
const authenticated = ref(false)
const orders = ref<Ticket[]>([])
const selected = ref('')
const busy = ref(false)
const error = ref('')
const photoUrl = ref('')
const photoId = ref('')
const messageOpened = ref(false)
const showMessage = ref(false)
const headers = computed(() => ({ Authorization: `Bearer ${adminKey.value}` }))
const days = computed(() => [...new Set([...shop.drops.value.map(d => d.id), ...orders.value.map(o => o.scheduleId)])].sort())
const dayOrders = computed(() => orders.value.filter(o => o.scheduleId === selected.value))
const approved = computed(() => dayOrders.value.filter(o => ['confirmed', 'ready', 'collected'].includes(o.status)))
const awaiting = computed(() => dayOrders.value.filter(o => o.status === 'pending_review'))
const tally = computed(() => products.map(p => ({ ...p, count: approved.value.reduce((sum, o) => sum + o.cart[p.id], 0) })))
const nextContact = computed(() => approved.value.find(o => o.status === 'ready' && !o.notified))
const message = computed(() => nextContact.value ? `Hi ${nextContact.value.name}! Your Tebu Drop ${nextContact.value.tag} is in the Level 7 pantry freezer. Look for your numbered paper bag. Pick up today, then mark collected on your private ticket: ${location.origin}/drop?t=${nextContact.value.token}` : '')
const sample = (): Ticket[] => [
  { token: 'demo-amirul', tag: '#A01', name: 'Amirul', phone: '', scheduleId: selected.value, cart: { flask: 2, jug: 0, asam: 1, limau: 0 }, total: 1300, status: 'confirmed', packed: false, notified: false, createdAt: new Date().toISOString() },
  { token: 'demo-nadia', tag: '#A02', name: 'Nadia', phone: '', scheduleId: selected.value, cart: { flask: 0, jug: 1, asam: 0, limau: 1 }, total: 1200, status: 'confirmed', packed: false, notified: false, createdAt: new Date().toISOString() },
  { token: 'demo-wei', tag: '#A03', name: 'Wei', phone: '', scheduleId: selected.value, cart: { flask: 1, jug: 0, asam: 0, limau: 0 }, total: 600, status: 'pending_review', packed: false, notified: false, createdAt: new Date().toISOString() },
]
let poll: ReturnType<typeof setInterval> | undefined
onMounted(async () => { shop.load(); selected.value = shop.selected.value || shop.drops.value[0]?.id || ''; if (shop.demo) { authenticated.value = true; orders.value = [...shop.tickets.value]; if (!orders.value.length) orders.value = sample() } else poll = setInterval(() => { if (authenticated.value && !busy.value && !document.hidden) refresh() }, 15000) })
async function refresh() {
  busy.value = true; error.value = ''
  try { const firstLoad = !authenticated.value; const data = await $fetch<{ orders: Ticket[] }>('/api/admin', { headers: headers.value }); orders.value = data.orders; authenticated.value = true; const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kuala_Lumpur', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); if (firstLoad && orders.value.some(o => o.scheduleId === today)) selected.value = today; else if (!selected.value) selected.value = days.value[0] || ''; }
  catch (e: any) { error.value = e.data?.message || 'Could not load pantry operations.'; authenticated.value = false }
  finally { busy.value = false }
}
async function update(order: Ticket, action: string) {
  error.value = ''; busy.value = true
  try {
    if (shop.demo) { if (action === 'approve') order.status = 'confirmed'; if (action === 'reject') order.status = 'rejected'; if (action === 'pack') order.packed = !order.packed; if (action === 'notify') order.notified = true; const saved = shop.tickets.value.find(t => t.token === order.token); if (saved) Object.assign(saved, order); shop.persist() }
    else { await $fetch('/api/admin', { method: 'PATCH', headers: headers.value, body: { action, orderToken: order.token } }); await refresh() }
  } catch (e: any) { error.value = e.data?.message || 'Could not save this update.' } finally { busy.value = false }
}
async function uploadPhoto(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]; if (!file) return
  busy.value = true; error.value = ''
  try { const compressed = await compressImage(file, 250_000); if (photoUrl.value.startsWith('blob:')) URL.revokeObjectURL(photoUrl.value); if (shop.demo) { photoUrl.value = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(compressed) }); photoId.value = 'demo' } else { const form = new FormData(); form.append('file', compressed); form.append('scheduleId', selected.value); const data = await $fetch<{ id: string; url: string }>('/api/uploads', { method: 'POST', headers: headers.value, body: form }); photoId.value = data.id; photoUrl.value = data.url } }
  catch (e: any) { error.value = e.data?.message || e.message } finally { busy.value = false }
}
async function markReady() {
  error.value = ''; busy.value = true
  try {
    if (shop.demo) { for (const o of approved.value) if (o.packed && o.status === 'confirmed') { o.status = 'ready'; o.photoUrl = photoUrl.value; const saved = shop.tickets.value.find(t => t.token === o.token); if (saved) { saved.status = 'ready'; saved.photoUrl = photoUrl.value } }; shop.persist() }
    else { await $fetch('/api/admin', { method: 'PATCH', headers: headers.value, body: { action: 'drop', scheduleId: selected.value, photoId: photoId.value } }); await refresh() }
    shop.notify('Packed bottles are ready for pickup.')
  } catch (e: any) { error.value = e.data?.message || 'Could not publish pantry drop.' } finally { busy.value = false }
}
async function receipt(order: Ticket) {
  if (shop.demo) { shop.notify('Sample receipt: demo order, no payment made.'); return }
  try { const blob = await $fetch<Blob>(`/api/media/${order.receiptId}`, { headers: headers.value, responseType: 'blob' }); const url = URL.createObjectURL(blob); window.open(url, '_blank', 'noopener'); setTimeout(() => URL.revokeObjectURL(url), 60000) } catch { shop.notify('Could not load the receipt. Try again.') }
}
function openMessage() { if (!nextContact.value) return; messageOpened.value = true; if (shop.demo) showMessage.value = true; else window.open(`https://wa.me/${nextContact.value.phone}?text=${encodeURIComponent(message.value)}`, '_blank', 'noopener,noreferrer') }
async function sent() { if (!nextContact.value) return; await update(nextContact.value, 'notify'); messageOpened.value = false; showMessage.value = false }
watch(selected, () => { photoId.value = ''; if (photoUrl.value.startsWith('blob:')) URL.revokeObjectURL(photoUrl.value); photoUrl.value = ''; messageOpened.value = false; showMessage.value = false })
onBeforeUnmount(() => { clearInterval(poll); if (photoUrl.value.startsWith('blob:')) URL.revokeObjectURL(photoUrl.value) })
</script>
<template>
  <div class="inner-page"><div class="section-heading"><span class="eyebrow">BEHIND THE BOTTLES</span><button v-if="authenticated && !shop.demo" class="icon-button" aria-label="Lock admin" @click="authenticated = false; adminKey = ''; orders = []"><LogOut :size="16"/></button></div><h1 class="page-title">Good morning, operator.</h1><p class="page-subtitle">A little prep. A well-stocked pantry.</p><p v-if="error" class="error" role="alert">{{ error }}</p>
    <form v-if="!authenticated" class="login-card" @submit.prevent="refresh"><h2>Pantry operations</h2><p>This area is for the drop operator. Enter your admin key to continue. It stays in memory for this session.</p><label class="field-label" for="admin-key">Admin key</label><input id="admin-key" v-model="adminKey" class="input" type="password" required autocomplete="off"/><button class="primary full-width" :disabled="busy">{{ busy ? 'Checking…' : 'Open pantry ops' }}</button></form>
    <template v-else><span v-if="shop.demo" class="status-pill">DEMO OPERATIONS · SAMPLE DATA IF NO ORDERS</span><div class="phase-switch"><button :class="{ active: phase === 1 }" @click="phase = 1"><Backpack :size="15"/>1. Pack at home</button><button :class="{ active: phase === 2 }" @click="phase = 2"><Snowflake :size="15"/>2. Pantry drop</button></div><label class="field-label" for="admin-day">Drop day</label><select id="admin-day" v-model="selected" class="admin-select"><option v-for="day in days" :key="day" :value="day">{{ new Date(`${day}T00:00:00Z`).toLocaleDateString('en-MY', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }) }}</option></select>
    <div class="metric-grid"><div class="metric"><b>{{ approved.length }}</b><span>PAPER BAGS</span></div><div class="metric"><b>{{ approved.reduce((n, o) => n + bottleCount(o.cart), 0) }}</b><span>BOTTLES</span></div><div class="metric"><b>{{ approved.filter(o => o.status === 'collected').length }}/{{ approved.length }}</b><span>COLLECTED</span></div></div>
    <template v-if="phase === 1"><div class="section-heading"><h2>Today’s bottle count.</h2><ShoppingBag :size="17"/></div><div class="ticket-note"><div v-for="p in tally.filter(p => p.count)" :key="p.id" class="ticket-item"><span>{{ p.name }} · {{ p.size }}</span><strong>{{ p.count }}</strong></div><span v-if="!approved.length">No confirmed orders for this drop yet.</span></div><div class="packing-list"><div class="section-heading"><h2>One bag. One tag.</h2><span class="subtle">{{ approved.filter(o => o.packed).length }}/{{ approved.length }} packed</span></div><label v-for="order in approved" :key="order.token" :class="['packing-row', { packed: order.packed }]"><input type="checkbox" :checked="order.packed" :disabled="busy || order.status !== 'confirmed'" @change="update(order, 'pack')"/><div><strong>{{ order.tag }} · {{ order.name }}</strong><p>{{ cartSummary(order.cart) }}</p></div><Check v-if="order.packed" :size="15"/></label></div><section v-if="awaiting.length" class="admin-review"><div class="section-heading"><h2>Receipts to check.</h2><span class="subtle">{{ awaiting.length }} waiting</span></div><article v-for="order in awaiting" :key="order.token" class="review-card"><div class="review-head"><strong>{{ order.tag }} · {{ order.name }}</strong><b>{{ money(order.total) }}</b></div><p>{{ cartSummary(order.cart) }}</p><button class="text-button" @click="receipt(order)">View receipt <ExternalLink :size="12"/></button><div class="review-actions"><button class="secondary danger" :disabled="busy" @click="update(order, 'reject')">Needs attention</button><button class="primary" :disabled="busy" @click="update(order, 'approve')">Confirm payment <Check :size="13"/></button></div></article></section></template>
    <template v-else><div class="section-heading"><h2>Proof of the pantry drop.</h2><Snowflake :size="17"/></div><p class="section-caption">Put the packed bags in the freezer. Take one photo, then mark this drop ready.</p><label class="upload-zone admin-photo"><img v-if="photoUrl" :src="photoUrl" alt="Freezer drop preview"/><template v-else><UploadCloud :size="26"/><strong>Upload the freezer photo</strong><span>JPG, PNG or WebP · Compressed before upload</span></template><input type="file" accept="image/jpeg,image/png,image/webp" :disabled="busy" @change="uploadPhoto"/></label><button class="primary full-width" :disabled="busy || !photoId || !approved.some(o => o.packed && o.status === 'confirmed')" @click="markReady"><Snowflake :size="16"/>Mark packed bags ready for pickup</button><section class="dispatch-card"><span class="eyebrow" style="justify-content:center">ONE MESSAGE AT A TIME</span><template v-if="nextContact"><strong>{{ nextContact.tag }} · {{ nextContact.name }}</strong><p>Let them know their bottle is in the freezer.</p><div v-if="showMessage" class="message-preview">{{ message }}</div><button class="primary full-width" :disabled="busy" @click="openMessage"><MessageCircle :size="16"/>{{ shop.demo ? 'Preview WhatsApp message' : 'Open WhatsApp message' }}</button><button v-if="messageOpened" class="secondary full-width" style="margin-top:10px" :disabled="busy" @click="sent">{{ shop.demo ? 'Simulate sent · Next person' : 'I’ve sent it · Next person' }}<span> →</span></button><p class="helper">Opening WhatsApp doesn’t send the message. Confirm here after sending.</p></template><template v-else><strong>All caught up.</strong><p>Ready bags with unsent messages will appear here.</p></template></section><div class="section-heading"><h2>Collection monitor.</h2><span class="subtle">{{ shop.demo ? 'On this device' : 'Refresh for latest' }}</span></div><div v-for="order in approved" :key="order.token" class="collection-row"><strong>{{ order.tag }}</strong><span>{{ order.name }}</span><span class="status-pill">{{ order.status === 'collected' ? 'COLLECTED' : order.status === 'ready' ? 'IN FREEZER' : 'PACKING' }}</span></div></template>
    <div class="admin-refresh"><span>Only verified payments enter the packing list.</span><button v-if="!shop.demo" :disabled="busy" @click="refresh"><RefreshCw :size="12"/>Refresh</button></div>
    </template>
  </div>
</template>
