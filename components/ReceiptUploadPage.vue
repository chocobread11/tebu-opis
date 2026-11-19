<script setup lang="ts">
import { UploadCloud, Check, LoaderCircle } from '~/lib/icons'
import {reservationExpired} from '~/shared/order'
import { money } from '~/shared/domain'
import { compressImage } from '~/utils/compress'
const route = useRoute()
const order = ref<{ tag: string; total: number; scheduleId: string; status: string; expiresAt: string } | null>(null)
const credential = ref('')
const busy = ref(false)
const loading = ref(true)
const error = ref('')
const file = shallowRef<File | null>(null)
const preview = ref('')
const now=ref(Date.now()),expired=computed(()=>!!order.value&&reservationExpired(order.value,now.value))
let timer:ReturnType<typeof setInterval>|undefined
const complete = computed(() => !!order.value && ['pending_review', 'confirmed', 'ready', 'collected'].includes(order.value.status))
const token = computed(() => typeof route.params.code === 'string' ? route.params.code : typeof route.query.t === 'string' ? route.query.t : '')
const headers = computed(() => ({ Authorization: `Receipt ${credential.value}` }))
useHead({ title: 'Upload your receipt · Tebu Drop', meta: [{ name: 'robots', content: 'noindex, nofollow' }] })
let requestVersion = 0
function clearFile() {
  if (preview.value) URL.revokeObjectURL(preview.value)
  preview.value = ''; file.value = null
}
async function loadOrder() {
  const version = ++requestVersion
  loading.value = true; error.value = ''; order.value = null; clearFile()
  credential.value = window.location.hash.slice(1)
  try {
    if (!/^[\w-]{43}$/.test(token.value) || !/^[\w-]{43}$/.test(credential.value)) throw new Error('Open the private upload link from your checkout QR code.')
    const result = await $fetch<{ tag: string; total: number; scheduleId: string; status: string; expiresAt: string }>(`/api/orders/${token.value}/receipt-upload`, { headers: headers.value })
    if (version === requestVersion) order.value = result
  } catch (e: any) { if (version === requestVersion) error.value = e.data?.message || e.message || 'This upload link is unavailable.' }
  finally { if (version === requestVersion) loading.value = false }
}
onMounted(()=>{loadOrder();timer=setInterval(()=>now.value=Date.now(),1000)})
watch(() => route.fullPath, () => { if (import.meta.client) loadOrder() })
onBeforeUnmount(() => { requestVersion++;clearInterval(timer); clearFile() })
async function choose(event: Event) {
  const selected = (event.target as HTMLInputElement).files?.[0]
  if (!selected) return
  busy.value = true; error.value = ''; clearFile()
  const version = requestVersion
  try {
    const result = await compressImage(selected)
    if (version === requestVersion) { file.value = result; preview.value = URL.createObjectURL(result) }
  } catch (e: any) { if (version === requestVersion) error.value = e.message }
  finally { busy.value = false }
}
async function submit() {
  if (!file.value || !order.value || busy.value) return
  busy.value = true; error.value = ''
  const version = requestVersion
  const orderToken = token.value
  const authorization = { ...headers.value }
  try {
    const form = new FormData(); form.append('file', file.value); form.append('orderToken', orderToken)
    const upload = await $fetch<{ id: string }>('/api/uploads', { method: 'POST', headers: authorization, body: form })
    const ticket = await $fetch<{ status: string }>(`/api/orders/${orderToken}`, { method: 'PATCH', headers: authorization, body: { action: 'receipt', receiptId: upload.id } })
    if (version === requestVersion && order.value) { order.value.status = ticket.status; clearFile() }
  } catch (e: any) { if (version === requestVersion) error.value = e.data?.message || 'Could not submit your receipt. Please try again.' }
  finally { busy.value = false }
}
</script>
<template>
  <div class="receipt-only-page" :aria-busy="loading || busy">
    <span class="eyebrow">TEBU DROP · PAYMENT RECEIPT</span>
    <h1>{{ complete ? 'Receipt received.' : 'Upload your receipt.' }}</h1>
    <p v-if="loading" class="helper" role="status">Finding your order…</p>
    <template v-if="order">
      <div class="order-summary"><strong>{{ order.tag }} · {{ money(order.total) }}</strong><span>Pickup date · {{ order.scheduleId }}</span></div>
      <div v-if="complete" role="status"><p class="success-text"><Check aria-hidden="true" :size="18" />Your receipt is submitted for verification.</p><p class="helper">You can return to your laptop. Your checkout will update automatically.</p></div>
      <form v-else-if="order.status === 'pending_payment'&&!expired" @submit.prevent="submit">
        <label class="upload-zone"><img v-if="preview" :src="preview" alt="Your payment receipt preview" /><template v-else><UploadCloud aria-hidden="true" :size="28" /><strong>Choose payment receipt</strong><span>JPG, PNG or WebP · Up to 12 MB</span></template><input type="file" aria-label="Payment receipt" accept="image/jpeg,image/png,image/webp" :disabled="busy" :aria-invalid="!!error" :aria-describedby="error ? 'phone-upload-error' : 'phone-upload-help'" @change="choose" /></label>
        <p id="phone-upload-help" class="helper">Choose your bank receipt, then submit it below. Your receipt stays private. Submit before {{ new Date(order.expiresAt).toLocaleTimeString('en-MY', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kuala_Lumpur' }) }} MYT.</p>
        <button class="primary full-width" type="submit" :disabled="busy || !file" aria-describedby="phone-upload-help"><LoaderCircle v-if="busy" class="spin" aria-hidden="true" :size="16" />{{ busy ? 'Preparing your receipt…' : 'Submit payment receipt' }}</button>
      </form>
      <p v-else class="helper">{{expired?'This reservation expired.':'This order is no longer accepting receipts.'}} Contact the operator if you have paid.</p>
    </template>
    <p v-if="error" id="phone-upload-error" class="error" role="alert">{{ error }}</p>
    <p v-if="error && !order" class="helper">Return to your checkout and open “Using a laptop? Upload from your phone” for this order’s link. If the reservation has expired and you have paid, contact the operator.</p>
  </div>
</template>
