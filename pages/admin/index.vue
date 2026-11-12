<script setup lang="ts">
import { PackageCheck, Snowflake, CheckCircle2, Camera, RefreshCw, LoaderCircle, Users, MessageCircle } from '~/lib/icons'
import { cartSummary, malaysiaToday, describeDrop, ticketWhatsAppUrl, type Ticket } from '~/shared/domain'
import { compressImage } from '~/utils/compress'
const shop = useShop()
const admin = useAdmin()
const { orders, authenticated, headers } = admin
const phase = ref(1)
const selected = ref(malaysiaToday())
const busy = ref(false)
const error = ref('')
const confirmation = ref<{ action: 'drop' } | null>(null)
async function confirmAction() {
  await markReady()
  if (!error.value) confirmation.value = null
}
const photoUrl = ref('')
const photoId = ref('')
const photoInput = ref<HTMLInputElement | null>(null)
const dayOrders = computed(() => orders.value.filter(o => o.scheduleId === selected.value))
const approved = computed(() => dayOrders.value.filter(o => ['confirmed', 'ready', 'collected'].includes(o.status)))
const packingOrders = computed(() => dayOrders.value.filter(order => order.status === 'confirmed'))
const tally = computed(() => shop.products.map(p => ({ ...p, count: packingOrders.value.reduce((sum, o) => sum + o.cart[p.id], 0) })))
const packedCount = computed(() => packingOrders.value.filter(order => order.packed).length)
const packProgress = computed(() => packingOrders.value.length ? Math.round(packedCount.value / packingOrders.value.length * 100) : 0)
const collectedCount = computed(() => approved.value.filter(order => order.status === 'collected').length)
const pickupProgress = computed(() => approved.value.length ? Math.round(collectedCount.value / approved.value.length * 100) : 0)
const displayPhoto = computed(() => photoUrl.value || approved.value.find(order => order.photoUrl)?.photoUrl || '')
const hasDropPhoto = computed(() => !!photoId.value || admin.local && !!displayPhoto.value)
const canRemovePhoto = computed(() => !!photoId.value && !approved.value.some(order => order.photoUrl))
const selectedDay = computed(() => describeDrop(selected.value))
const currentSchedule = computed(() => admin.schedules.value.find(day => day.id === selected.value))
const hasDrop = computed(() => !!currentSchedule.value?.open || !!currentSchedule.value?.droppedAt || dayOrders.value.some(order => order.status !== 'rejected'))
const origin = useRequestURL().origin
let poll: ReturnType<typeof setInterval> | undefined
watch(authenticated, value => { if (value && !admin.local) refresh() })
onMounted(async () => {
  selected.value = malaysiaToday()
  if (admin.local || authenticated.value) await refresh()
  poll = setInterval(() => { if (authenticated.value && !busy.value && !document.hidden) refresh() }, 5000)
  document.addEventListener('visibilitychange', onVisible)
  window.addEventListener('storage', onStorage)
})
function onVisible() { if (!document.hidden && authenticated.value) refresh() }
function onStorage(event: StorageEvent) { if (['tebu_demo_orders', 'tebu_admin_orders'].includes(event.key || '') && authenticated.value) refresh() }
async function refresh() {
  if (busy.value) return
  busy.value = true; error.value = ''; selected.value = malaysiaToday()
  try {
    await shop.refreshDrops()
    await admin.refresh()
    selected.value = malaysiaToday()
  }
  catch (e: any) { error.value = e.data?.message || 'Could not load pantry operations.' }
  finally { busy.value = false }
}
async function update(order: Ticket, action: string, value?: boolean) {
  if (busy.value) return
  error.value = ''; busy.value = true; admin.invalidate()
  try {
    if (admin.local) {
      if (action === 'pack') {
        if (order.status !== 'confirmed') throw new Error('Only confirmed orders can be packed.')
        order.packed = value ?? !order.packed
      }
      if (action === 'notify') order.notified = value ?? true
      admin.persist()
    } else {
      const result = await $fetch<{ order?: Ticket }>('/api/admin', { method: 'PATCH', headers: headers.value, body: { action, orderToken: order.token, ...(action === 'pack' ? { packed: value ?? !order.packed } : action === 'notify' ? { notified: value ?? true } : {}) } })
      if (result.order) {
        const current = orders.value.find(row => row.token === result.order!.token)
        if (current) Object.assign(current, result.order)
      }
      await admin.refresh()
    }
  } catch (e: any) { error.value = e.data?.message || e.message || 'Could not save this update.' }
  finally { busy.value = false }
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
    if (admin.local) { const freezerPhoto = displayPhoto.value; for (const o of approved.value) if (o.packed && o.status === 'confirmed') { o.status = 'ready'; o.photoUrl = freezerPhoto; const saved = shop.tickets.value.find(t => t.token === o.token); if (saved) { saved.status = 'ready'; saved.photoUrl = freezerPhoto } }; admin.persist() }
    else { admin.invalidate(); await $fetch('/api/admin', { method: 'PATCH', headers: headers.value, body: { action: 'drop', scheduleId: selected.value, photoId: photoId.value } }); await admin.refresh() }
    shop.notify('Packed bottles are ready for pickup.')
  } catch (e: any) { error.value = e.data?.message || 'Could not publish pantry drop.' } finally { busy.value = false }
}
function clearPhoto() {
  if (photoUrl.value.startsWith('blob:')) URL.revokeObjectURL(photoUrl.value)
  photoUrl.value = ''; photoId.value = ''
}
function dropStatus(order: Ticket) {
  if (order.status === 'collected') return { label: 'Collected', variant: 'collected' }
  if (order.status === 'ready' && order.photoUrl) return { label: 'Ready', variant: 'ready' }
  if (order.packed) return { label: 'Packed', variant: 'packed' }
  return { label: 'To pack', variant: 'pending' }
}
watch(selected, () => { photoId.value = ''; if (photoUrl.value.startsWith('blob:')) URL.revokeObjectURL(photoUrl.value); photoUrl.value = '' })
onBeforeUnmount(() => {
  clearInterval(poll); document.removeEventListener('visibilitychange', onVisible); window.removeEventListener('storage', onStorage)
  if (photoUrl.value.startsWith('blob:')) URL.revokeObjectURL(photoUrl.value)
})
</script>
<template>
  <div class="inner-page ops-page" :aria-busy="busy">
    <p v-if="error && !confirmation" id="operations-error" class="error" role="alert">{{ error }}</p>
    <AdminLogin v-if="!authenticated" />
    <template v-if="authenticated">
      <section class="ops-section checklist-day" aria-label="Today's drop" :data-date="selected">
        <div class="section-heading"><div><h2>Today's drop</h2><p class="ops-caption">{{ selectedDay.full }}</p></div><span class="ops-badge">{{ hasDrop ? 'Today' : 'No drop scheduled' }}</span></div>
        <p class="ops-caption">Packing and pantry drop for today.</p>
        <NuxtLink to="/admin/calendar" class="text-button">View transactions and calendar →</NuxtLink>
      </section>

      <div class="phase-switch" role="group" aria-label="Checklist phase">
        <button :class="{ active: phase === 1 }" :aria-pressed="phase === 1" @click="phase = 1"><PackageCheck aria-hidden="true" :size="16" />1. Pack at home</button>
        <button :class="{ active: phase === 2 }" :aria-pressed="phase === 2" @click="phase = 2"><Snowflake aria-hidden="true" :size="16" />2. Pantry drop</button>
      </div>

      <div v-if="phase === 1" class="ops-workflow">
        <section class="ops-pack-summary" aria-labelledby="packing-heading">
          <div class="section-heading">
            <div><h2 id="packing-heading">What to pack today</h2><p class="ops-caption">{{ selectedDay?.day }} · {{ selectedDay?.date }}. Tick each bag when it is packed.</p></div>
            <span class="ops-badge">{{ packingOrders.length }} bags</span>
          </div>
          <div class="ops-bottle-tally" role="group" aria-label="Bottle count">
            <span v-for="product in tally.filter(product => product.count)" :key="product.id"><b>{{ product.count }}</b> {{ product.size }} {{ product.kind === 'addon' ? product.name : '' }}</span>
          </div>
          <div v-if="packingOrders.length" class="ops-progress-label"><span>Paper bags packed</span><strong>{{ packedCount }} / {{ packingOrders.length }}</strong></div>
          <div v-if="packingOrders.length" class="ops-progress" role="progressbar" aria-label="Packing progress" :aria-valuenow="packProgress" :aria-valuemin="0" :aria-valuemax="100"><span :style="{ transform: `scaleX(${packProgress / 100})` }" /></div>
        </section>

        <div v-if="packingOrders.length" class="packing-list" aria-label="Today's packing list">
          <label v-for="order in packingOrders" :key="order.token" class="packing-row" :class="{ packed: order.packed }" :data-token="order.token">
            <input type="checkbox" :aria-label="`Pack ${order.tag} for ${order.name}`" :checked="order.packed" :disabled="busy" @change="update(order, 'pack', ($event.target as HTMLInputElement).checked)" />
            <div class="ops-order-details"><div class="ops-order-top"><strong><span>{{ order.tag }}</span> {{ order.name }}</strong><span class="ops-badge">{{ order.packed ? 'Packed' : 'To pack' }}</span></div><p>{{ order.varietyName }} · {{ cartSummary(order.cart, shop.products) }}</p><OrderRemarks :value="order.remarks" compact /></div>
          </label>
        </div>
        <div v-else class="ops-empty"><PackageCheck aria-hidden="true" :size="26" /><strong>No bags to pack today.</strong><p>Confirmed orders for today appear here. Review payments and past transactions in the calendar.</p><NuxtLink to="/admin/calendar" class="text-button">Open calendar →</NuxtLink></div>
        <div v-if="packingOrders.length && packedCount === packingOrders.length" class="ops-success"><CheckCircle2 aria-hidden="true" :size="17" /><p>All confirmed orders are packed. Publish the pantry drop once the bags are in the freezer.</p></div>
      </div>

      <div v-else class="ops-workflow pantry-workflow">
        <section class="ops-section" aria-labelledby="proof-heading">
          <div class="ops-step-heading"><span class="ops-step-number">1</span><div><h2 id="proof-heading">Freezer drop proof</h2><p class="ops-caption">Snap the loaded shelf, then mark packed bags ready.</p></div><span v-if="displayPhoto" class="ops-badge ops-badge-success">Photo added</span></div>
          <label class="upload-zone admin-photo" :class="{ 'has-photo': displayPhoto }">
            <img v-if="displayPhoto" :src="displayPhoto" alt="Freezer drop preview" />
            <template v-else><span class="ops-camera"><LoaderCircle aria-hidden="true" v-if="busy" class="spin" :size="23" /><Camera aria-hidden="true" v-else :size="23" /></span><strong>{{ busy ? 'Preparing photo…' : 'Upload the freezer photo' }}</strong><span>JPG, PNG or WebP · Auto-compressed</span></template>
            <input ref="photoInput" aria-label="Freezer drop photo" :aria-invalid="!!error" :aria-describedby="error ? 'operations-error' : 'photo-help'" type="file" accept="image/jpeg,image/png,image/webp" :disabled="busy" @change="uploadPhoto" />
          </label>
          <p id="photo-help" class="helper">Upload a freezer photo and pack at least one bag to mark orders ready.</p>
          <button class="primary full-width" aria-describedby="photo-help" :disabled="busy || !hasDropPhoto || !approved.some(order => order.packed && order.status === 'confirmed')" @click="error = ''; confirmation = { action: 'drop' }"><Snowflake aria-hidden="true" :size="16" />Mark packed bags ready for pickup</button>
          <div v-if="displayPhoto" class="ops-photo-actions"><span>Level 7 pantry freezer</span><div><button class="text-button" :disabled="busy" @click="photoInput?.click()"><RefreshCw aria-hidden="true" :size="12" />Retake</button><button v-if="canRemovePhoto" class="text-button danger" :disabled="busy" @click="clearPhoto">Remove</button></div></div>
        </section>

        <section class="ops-section collection-transactions" aria-labelledby="collection-heading">
          <div class="section-heading"><div><h2 id="collection-heading">Drop status &amp; WhatsApp</h2><p class="ops-caption">{{ collectedCount }} of {{ approved.length }} orders collected. Share each customer’s live ticket to follow their drop.</p></div><span class="ops-badge">{{ pickupProgress }}%</span></div>
          <div class="ops-progress" role="progressbar" aria-label="Collection progress" :aria-valuenow="pickupProgress" :aria-valuemin="0" :aria-valuemax="100"><span :style="{ transform: `scaleX(${pickupProgress / 100})` }" /></div>
          <div class="today-pickups"><article v-for="order in approved" :key="order.token" class="collection-row"><div class="collection-customer"><strong>{{ order.tag }} · {{ order.name }}</strong><span :class="['ops-badge', 'drop-status-badge', `drop-status-${dropStatus(order).variant}`]">{{ dropStatus(order).label }}</span><OrderRemarks :value="order.remarks" compact /></div><div class="drop-message-actions"><a v-if="ticketWhatsAppUrl(order, origin)" class="secondary small-action drop-message-button" :href="ticketWhatsAppUrl(order, origin)" target="_blank" rel="noopener noreferrer" :aria-label="`Send ${order.tag} status by WhatsApp`"><MessageCircle aria-hidden="true" :size="14" />Message</a><button v-else class="secondary small-action drop-message-button" type="button" disabled :aria-label="`No phone number for ${order.tag}`"><MessageCircle aria-hidden="true" :size="14" />No phone</button><label class="message-sent-control"><input type="checkbox" :checked="order.notified" :disabled="busy" @change="update(order, 'notify', ($event.target as HTMLInputElement).checked)" /><span>{{ order.notified ? 'Message sent' : 'Mark as sent' }}</span></label></div></article><p v-if="!approved.length" class="helper">No pickups for today.</p></div>
          <div class="ops-section-footer"><Users aria-hidden="true" :size="12" />{{ approved.length }} orders today<span>Updates every 5 seconds</span></div>
        </section>
      </div>
      <div class="admin-refresh"><span>{{ admin.local ? 'Preview changes are saved on this device.' : 'Packing, drop and collection statuses refresh automatically.' }}</span><button v-if="!admin.local" :disabled="busy" @click="refresh"><RefreshCw aria-hidden="true" :size="12" />Refresh</button></div>
    </template>
    <p v-else-if="busy" class="helper">Loading drop operations…</p>
    <ConfirmDialog :open="!!confirmation" title="Publish this pantry drop?" description="Packed orders will be marked ready for pickup. Check the freezer photo and bags before continuing." confirm-label="Mark ready for pickup" :destructive="false" :busy="busy" :error="error" @confirm="confirmAction" @update:open="value => { if (!value) confirmation = null }" />
  </div>
</template>
