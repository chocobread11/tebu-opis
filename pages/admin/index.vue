<script setup lang="ts">
import { PackageCheck, Snowflake, Check, CheckCircle2, Camera, MessageCircle, RefreshCw, ExternalLink, LoaderCircle, Users } from 'lucide-vue-next'
import { cartSummary, money, malaysiaToday, describeDrop, type Ticket } from '~/shared/domain'
import { compressImage } from '~/utils/compress'
const shop = useShop()
const admin = useAdmin()
const { orders, authenticated, headers } = admin
const phase = ref(1)
const selected = ref(malaysiaToday())
const busy = ref(false)
const error = ref('')
const confirmation = ref<{ action: 'approve' | 'reject' | 'drop'; order?: Ticket } | null>(null)
const confirmationCopy = computed(() => confirmation.value?.action === 'drop' ? { title: 'Publish this pantry drop?', description: 'Packed orders will be marked ready for pickup. Check the freezer photo and bags before continuing.', label: 'Mark ready for pickup' } : confirmation.value?.action === 'approve' ? { title: 'Confirm this payment?', description: `Confirm that the receipt for ${confirmation.value.order?.tag} matches the order total. This order will enter the packing checklist.`, label: 'Confirm payment' } : { title: 'Reject this receipt?', description: `Order ${confirmation.value?.order?.tag || ''} will need attention and its reserved bottles will be released.`, label: 'Reject receipt' })
async function confirmAction() {
  const pending = confirmation.value
  if (!pending) return
  if (pending.action === 'drop') await markReady()
  else if (pending.order) await update(pending.order, pending.action)
  if (!error.value) confirmation.value = null
}
const photoUrl = ref('')
const photoId = ref('')
const messageOpened = ref(false)
const showMessage = ref(false)
const photoInput = ref<HTMLInputElement | null>(null)
const dayOrders = computed(() => orders.value.filter(o => o.scheduleId === selected.value))
const approved = computed(() => dayOrders.value.filter(o => ['confirmed', 'ready', 'collected'].includes(o.status)))
const awaiting = computed(() => dayOrders.value.filter(o => o.status === 'pending_review'))
const tally = computed(() => shop.products.map(p => ({ ...p, count: approved.value.reduce((sum, o) => sum + o.cart[p.id], 0) })))
const nextContact = computed(() => approved.value.find(o => o.status === 'ready' && !o.notified && !!o.phone))
const packedCount = computed(() => approved.value.filter(order => order.packed).length)
const packProgress = computed(() => approved.value.length ? Math.round(packedCount.value / approved.value.length * 100) : 0)
const readyOrders = computed(() => approved.value.filter(order => ['ready', 'collected'].includes(order.status)))
const notifiedCount = computed(() => readyOrders.value.filter(order => order.notified).length)
const collectedCount = computed(() => approved.value.filter(order => order.status === 'collected').length)
const pickupProgress = computed(() => approved.value.length ? Math.round(collectedCount.value / approved.value.length * 100) : 0)
const alertProgress = computed(() => readyOrders.value.length ? Math.round(notifiedCount.value / readyOrders.value.length * 100) : 0)
const displayPhoto = computed(() => photoUrl.value || approved.value.find(order => order.photoUrl)?.photoUrl || '')
const canRemovePhoto = computed(() => !!photoId.value && !approved.value.some(order => order.photoUrl))
const selectedDay = computed(() => describeDrop(selected.value))
const currentSchedule = computed(() => admin.schedules.value.find(day => day.id === selected.value))
const hasDrop = computed(() => !!currentSchedule.value?.open || !!currentSchedule.value?.droppedAt || dayOrders.value.some(order => order.status !== 'rejected'))
const message = computed(() => nextContact.value ? `Hi ${nextContact.value.name}! Your ${nextContact.value.varietyName || 'Tebu Drop'} ${nextContact.value.tag} is in the Level 7 pantry freezer. Look for your numbered paper bag. Pick up today, then mark collected on your private ticket: ${location.origin}/drop?t=${nextContact.value.token}` : '')
let poll: ReturnType<typeof setInterval> | undefined
watch(authenticated, value => { if (value && !admin.local) refresh() })
onMounted(async () => {
  selected.value = malaysiaToday()
  if (admin.local || authenticated.value) await refresh()
  poll = setInterval(() => { if (authenticated.value && !busy.value && !document.hidden) refresh() }, 15000)
})
async function refresh() {
  busy.value = true; error.value = ''; selected.value = malaysiaToday()
  try {
    await shop.refreshDrops()
    await admin.refresh()
    selected.value = malaysiaToday()
  }
  catch (e: any) { error.value = e.data?.message || 'Could not load pantry operations.' }
  finally { busy.value = false }
}
async function update(order: Ticket, action: string) {
  error.value = ''; busy.value = true
  try {
    if (admin.local) { if (action === 'approve') order.status = 'confirmed'; if (action === 'reject') order.status = 'rejected'; if (action === 'pack') order.packed = !order.packed; if (action === 'notify') order.notified = true; const saved = shop.tickets.value.find(t => t.token === order.token); if (saved) Object.assign(saved, order); admin.persist() }
    else { await $fetch('/api/admin', { method: 'PATCH', headers: headers.value, body: { action, orderToken: order.token } }); await refresh() }
  } catch (e: any) { error.value = e.data?.message || 'Could not save this update.' } finally { busy.value = false }
}
async function uploadPhoto(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  busy.value = true; error.value = ''
  try { const compressed = await compressImage(file, 250_000); if (photoUrl.value.startsWith('blob:')) URL.revokeObjectURL(photoUrl.value); if (admin.local) { photoUrl.value = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(compressed) }); photoId.value = 'demo' } else { const form = new FormData(); form.append('file', compressed); form.append('scheduleId', selected.value); const data = await $fetch<{ id: string; url: string }>('/api/uploads', { method: 'POST', headers: headers.value, body: form }); photoId.value = data.id; photoUrl.value = URL.createObjectURL(compressed) } }
  catch (e: any) { error.value = e.data?.message || e.message } finally { busy.value = false }
}
async function markReady() {
  error.value = ''; busy.value = true
  try {
    if (admin.local) { for (const o of approved.value) if (o.packed && o.status === 'confirmed') { o.status = 'ready'; o.photoUrl = photoUrl.value; const saved = shop.tickets.value.find(t => t.token === o.token); if (saved) { saved.status = 'ready'; saved.photoUrl = photoUrl.value } }; admin.persist() }
    else { await $fetch('/api/admin', { method: 'PATCH', headers: headers.value, body: { action: 'drop', scheduleId: selected.value, photoId: photoId.value } }); await refresh() }
    shop.notify('Packed bottles are ready for pickup.')
  } catch (e: any) { error.value = e.data?.message || 'Could not publish pantry drop.' } finally { busy.value = false }
}
async function receipt(order: Ticket) {
  if (admin.local) { shop.notify('Sample receipt: demo order, no payment made.'); return }
  try { const blob = await $fetch<Blob>(`/api/media/${order.receiptId}`, { headers: headers.value, responseType: 'blob' }); const url = URL.createObjectURL(blob); window.open(url, '_blank', 'noopener'); setTimeout(() => URL.revokeObjectURL(url), 60000) } catch { shop.notify('Could not load the receipt. Try again.') }
}
function openMessage() { if (!nextContact.value) return; messageOpened.value = true; if (admin.local) showMessage.value = true; else window.open(`https://wa.me/${nextContact.value.phone}?text=${encodeURIComponent(message.value)}`, '_blank', 'noopener,noreferrer') }
function clearPhoto() {
  if (photoUrl.value.startsWith('blob:')) URL.revokeObjectURL(photoUrl.value)
  photoUrl.value = ''; photoId.value = ''
}
async function sent() { if (!nextContact.value) return; await update(nextContact.value, 'notify'); messageOpened.value = false; showMessage.value = false }
watch(selected, () => { photoId.value = ''; if (photoUrl.value.startsWith('blob:')) URL.revokeObjectURL(photoUrl.value); photoUrl.value = ''; messageOpened.value = false; showMessage.value = false })
onBeforeUnmount(() => { clearInterval(poll); if (photoUrl.value.startsWith('blob:')) URL.revokeObjectURL(photoUrl.value) })
</script>
<template>
  <div class="inner-page ops-page" :aria-busy="busy">
    <p v-if="error && !confirmation" id="operations-error" class="error" role="alert">{{ error }}</p>
    <AdminLogin v-if="!authenticated" />
    <template v-if="authenticated">
      <section class="ops-section checklist-day" aria-label="Today's drop" :data-date="selected">
        <div class="section-heading"><div><h2>Today's drop</h2><p class="ops-caption">{{ selectedDay.full }}</p></div><span class="ops-badge">{{ hasDrop ? 'Today' : 'No drop scheduled' }}</span></div>
        <p class="ops-caption">Packing and pantry drop for today.</p>
        <NuxtLink to="/admin/calendar" class="text-button">Manage calendar and manual orders →</NuxtLink>
      </section>

      <div class="phase-switch" role="group" aria-label="Checklist phase">
        <button :class="{ active: phase === 1 }" :aria-pressed="phase === 1" @click="phase = 1"><PackageCheck aria-hidden="true" :size="16" />1. Pack at home</button>
        <button :class="{ active: phase === 2 }" :aria-pressed="phase === 2" @click="phase = 2"><Snowflake aria-hidden="true" :size="16" />2. Pantry drop</button>
      </div>

      <div v-if="phase === 1" class="ops-workflow">
        <section class="ops-pack-summary" aria-labelledby="packing-heading">
          <div class="section-heading">
            <div><h2 id="packing-heading">Paper bag checklist</h2><p class="ops-caption">{{ selectedDay?.day }} · {{ selectedDay?.date }}. Tap a bag to tick it off.</p></div>
            <span class="ops-badge">{{ approved.length }} tags</span>
          </div>
          <div class="ops-bottle-tally" role="group" aria-label="Bottle count">
            <span v-for="product in tally.filter(product => product.count)" :key="product.id"><b>{{ product.count }}</b> {{ product.size }} {{ product.kind === 'addon' ? product.name : '' }}</span>
          </div>
          <div v-if="approved.length" class="ops-progress-label"><span>Paper bags packed</span><strong>{{ packedCount }} / {{ approved.length }}</strong></div>
          <div v-if="approved.length" class="ops-progress" role="progressbar" aria-label="Packing progress" :aria-valuenow="packProgress" :aria-valuemin="0" :aria-valuemax="100"><span :style="{ transform: `scaleX(${packProgress / 100})` }" /></div>
        </section>

        <div v-if="approved.length" class="packing-list">
          <label v-for="order in approved" :key="order.token" :class="['packing-row', { packed: order.packed }]">
            <input type="checkbox" :aria-label="`Pack ${order.tag} for ${order.name}`" :checked="order.packed" :disabled="busy || order.status !== 'confirmed'" @change="update(order, 'pack')" />
            <div class="ops-order-details">
              <div class="ops-order-top"><strong><span>{{ order.tag }}</span> {{ order.name }}</strong><span class="ops-badge" :class="{ 'ops-badge-success': order.packed }">{{ order.status === 'collected' ? 'Collected' : order.status === 'ready' ? 'In freezer' : order.packed ? 'Packed' : 'To pack' }}</span></div>
              <p v-if="order.varietyName" class="order-variety">{{ order.varietyName }}</p><p>{{ cartSummary(order.cart, shop.products) }}</p>
              <div class="ops-order-meta"><span>{{ order.phone || (order.manualPaymentStatus ? 'Manual order' : 'Preview customer') }}</span><b>{{ money(order.total) }}{{ order.manualPaymentStatus ? ` · ${order.manualPaymentStatus}` : '' }}</b></div>
            </div>
          </label>
        </div>
        <div v-else class="ops-empty"><Snowflake aria-hidden="true" :size="26" :stroke-width="1.4" /><strong>No confirmed orders for {{ selectedDay?.day }}.</strong><p>Confirmed and manual orders appear in this packing list.</p></div>

        <div v-if="approved.length && packedCount === approved.length" class="ops-success"><CheckCircle2 aria-hidden="true" :size="17" /><p>All paper bags packed. Switch to Pantry drop when you reach Level 7.</p></div>

        <section v-if="awaiting.length" class="admin-review">
          <div class="section-heading"><div><h2>Receipts to check</h2><p class="ops-caption">Confirm payment before packing.</p></div><span class="ops-badge">{{ awaiting.length }} waiting</span></div>
          <article v-for="order in awaiting" :key="order.token" class="review-card">
            <div class="review-head"><strong>{{ order.tag }} · {{ order.name }}</strong><b>{{ money(order.total) }}{{ order.manualPaymentStatus ? ` · ${order.manualPaymentStatus}` : '' }}</b></div>
            <p v-if="order.varietyName" class="order-variety">{{ order.varietyName }}</p><p>{{ cartSummary(order.cart, shop.products) }}</p>
            <button class="text-button" @click="receipt(order)">View receipt <ExternalLink aria-hidden="true" :size="12" /></button>
            <div class="review-actions"><button class="secondary danger" :disabled="busy" @click="error = ''; confirmation = { action: 'reject', order }">Needs attention</button><button class="primary" :disabled="busy" @click="error = ''; confirmation = { action: 'approve', order }">Confirm payment <Check aria-hidden="true" :size="13" /></button></div>
          </article>
        </section>
      </div>

      <div v-else class="ops-workflow">
        <section class="ops-section" aria-labelledby="proof-heading">
          <div class="ops-step-heading"><span class="ops-step-number">1</span><div><h2 id="proof-heading">Freezer drop proof</h2><p class="ops-caption">Snap the loaded shelf, then mark packed bags ready.</p></div><span v-if="displayPhoto" class="ops-badge ops-badge-success">Photo added</span></div>
          <label class="upload-zone admin-photo" :class="{ 'has-photo': displayPhoto }">
            <img v-if="displayPhoto" :src="displayPhoto" alt="Freezer drop preview" />
            <template v-else><span class="ops-camera"><LoaderCircle aria-hidden="true" v-if="busy" class="spin" :size="23" /><Camera aria-hidden="true" v-else :size="23" /></span><strong>{{ busy ? 'Preparing photo…' : 'Upload the freezer photo' }}</strong><span>JPG, PNG or WebP · Auto-compressed</span></template>
            <input ref="photoInput" aria-label="Freezer drop photo" :aria-invalid="!!error" :aria-describedby="error ? 'operations-error' : 'photo-help'" type="file" accept="image/jpeg,image/png,image/webp" :disabled="busy" @change="uploadPhoto" />
          </label>
          <p id="photo-help" class="helper">Upload a freezer photo and pack at least one bag to mark orders ready.</p>
          <button class="primary full-width" aria-describedby="photo-help" :disabled="busy || !photoId || !approved.some(order => order.packed && order.status === 'confirmed')" @click="error = ''; confirmation = { action: 'drop' }"><Snowflake aria-hidden="true" :size="16" />Mark packed bags ready for pickup</button>
          <div v-if="displayPhoto" class="ops-photo-actions"><span>Level 7 pantry freezer</span><div><button class="text-button" :disabled="busy" @click="photoInput?.click()"><RefreshCw aria-hidden="true" :size="12" />Retake</button><button v-if="canRemovePhoto" class="text-button danger" :disabled="busy" @click="clearPhoto">Remove</button></div></div>
        </section>

        <section class="ops-section" aria-labelledby="alerts-heading">
          <div class="ops-step-heading"><span class="ops-step-number">2</span><div><h2 id="alerts-heading">WhatsApp drop alerts</h2><p class="ops-caption">A personal heads-up, one customer at a time.</p></div><span class="ops-badge">{{ notifiedCount }}/{{ readyOrders.length }}</span></div>
          <div class="ops-progress" role="progressbar" aria-label="Message progress" :aria-valuenow="alertProgress" :aria-valuemin="0" :aria-valuemax="100"><span :style="{ transform: `scaleX(${alertProgress / 100})` }" /></div>
          <div v-if="nextContact" class="ops-dispatch">
            <div class="ops-recipient"><span class="ops-avatar">{{ nextContact.name.slice(0, 1) }}</span><div><strong>{{ nextContact.tag }} · {{ nextContact.name }}</strong><p>{{ cartSummary(nextContact.cart, shop.products) }}</p></div><span class="ops-badge">Next</span></div>
            <p v-if="showMessage || !admin.local" class="message-preview">{{ message }}</p>
            <button class="primary full-width whatsapp-button" :disabled="busy" @click="openMessage"><MessageCircle aria-hidden="true" :size="16" />{{ admin.local ? 'Preview WhatsApp message' : 'Open WhatsApp message' }}</button>
            <button v-if="messageOpened" class="secondary full-width" :disabled="busy" @click="sent">{{ admin.local ? 'Simulate sent · Next person' : 'I’ve sent it · Next person' }} <span>→</span></button>
            <p class="helper">Confirm here after sending the message.</p>
          </div>
          <div v-else class="ops-success"><CheckCircle2 aria-hidden="true" :size="17" /><p>{{ readyOrders.length ? 'All drop alerts sent. Waiting for pickups.' : 'Ready bags with unsent messages will appear here.' }}</p></div>
        </section>

        <section class="ops-section" aria-labelledby="collection-heading">
          <div class="ops-step-heading"><span class="ops-step-number">3</span><div><h2 id="collection-heading">Live collection progress</h2><p class="ops-caption">{{ collectedCount }} of {{ approved.length }} bags picked up.</p></div><span class="ops-badge">{{ pickupProgress }}%</span></div>
          <div class="ops-progress" role="progressbar" aria-label="Collection progress" :aria-valuenow="pickupProgress" :aria-valuemin="0" :aria-valuemax="100"><span :style="{ transform: `scaleX(${pickupProgress / 100})` }" /></div>
          <div v-for="order in approved" :key="order.token" :class="['collection-row', { collected: order.status === 'collected' }]">
            <span class="ops-avatar"><CheckCircle2 aria-hidden="true" v-if="order.status === 'collected'" :size="17" /><template v-else>{{ order.tag.slice(-2) }}</template></span>
            <div><strong>{{ order.tag }} · {{ order.name }}</strong><p v-if="order.varietyName" class="order-variety">{{ order.varietyName }}</p><p>{{ cartSummary(order.cart, shop.products) }}</p></div>
            <span class="ops-badge" :class="{ 'ops-badge-success': order.status === 'collected' }">{{ order.status === 'collected' ? 'Collected' : order.notified ? 'Message sent' : order.status === 'ready' ? 'In freezer' : 'Packing' }}</span>
          </div>
          <p v-if="!approved.length" class="ops-caption ops-no-collection">No bags scheduled for this drop.</p>
          <div class="ops-section-footer"><Users aria-hidden="true" :size="12" />{{ approved.length }} customers in this batch<span>Level 7 pantry</span></div>
        </section>
      </div>
      <div class="admin-refresh"><span>{{ admin.local ? 'Preview changes are saved on this device.' : 'Manual orders show their payment status in the packing list.' }}</span><button v-if="!admin.local" :disabled="busy" @click="refresh"><RefreshCw aria-hidden="true" :size="12" />Refresh</button></div>
    </template>
    <p v-else-if="busy" class="helper">Loading drop operations…</p>
    <ConfirmDialog :open="!!confirmation" :title="confirmationCopy.title" :description="confirmationCopy.description" :confirm-label="confirmationCopy.label" :destructive="confirmation?.action === 'reject'" :busy="busy" :error="error" @confirm="confirmAction" @update:open="value => { if (!value) confirmation = null }" />
  </div>
</template>
