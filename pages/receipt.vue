<script setup lang="ts">
import { UploadCloud, Check, LoaderCircle } from '~/lib/icons'
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
const complete = computed(() => !!order.value && ['pending_review', 'confirmed', 'ready', 'collected'].includes(order.value.status))
const token = computed(() => typeof route.query.t === 'string' ? route.query.t : '')
const headers = computed(() => ({ Authorization: `Receipt ${credential.value}` }))
useHead({ title: 'Upload your receipt · Tebu Drop', meta: [{ name: 'robots', content: 'noindex, nofollow' }] })
onMounted(async () => {
  credential.value = window.location.hash.slice(1)
  try {
    if (!token.value || !credential.value) throw new Error('Open the upload link from your checkout QR code.')
    order.value = await $fetch<{ tag: string; total: number; scheduleId: string; status: string; expiresAt: string }>(`/api/orders/${token.value}/receipt-upload`, { headers: headers.value })
  } catch (e: any) { error.value = e.data?.message || e.message || 'This upload link is unavailable.' }
  finally { loading.value = false }
})
onBeforeUnmount(() => { if (preview.value) URL.revokeObjectURL(preview.value) })
async function choose(event: Event) {
  const selected = (event.target as HTMLInputElement).files?.[0]
  if (!selected) return
  busy.value = true; error.value = ''; file.value = null
  if (preview.value) URL.revokeObjectURL(preview.value)
  preview.value = ''
  try { file.value = await compressImage(selected); preview.value = URL.createObjectURL(file.value) }
  catch (e: any) { error.value = e.message }
  finally { busy.value = false }
}
async function submit() {
  if (!file.value || !order.value || busy.value) return
  busy.value = true; error.value = ''
  try {
    const form = new FormData(); form.append('file', file.value); form.append('orderToken', token.value)
    const upload = await $fetch<{ id: string }>('/api/uploads', { method: 'POST', headers: headers.value, body: form })
    const ticket = await $fetch<{ status: string }>(`/api/orders/${token.value}`, { method: 'PATCH', headers: headers.value, body: { action: 'receipt', receiptId: upload.id } })
    order.value.status = ticket.status
  } catch (e: any) { error.value = e.data?.message || 'Could not submit your receipt. Please try again.' }
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
      <form v-else-if="order.status === 'pending_payment'" @submit.prevent="submit">
        <label class="upload-zone"><img v-if="preview" :src="preview" alt="Your payment receipt preview" /><template v-else><UploadCloud aria-hidden="true" :size="28" /><strong>Choose payment receipt</strong><span>JPG, PNG or WebP · Up to 12 MB</span></template><input type="file" aria-label="Payment receipt" accept="image/jpeg,image/png,image/webp" :disabled="busy" :aria-invalid="!!error" :aria-describedby="error ? 'phone-upload-error' : 'phone-upload-help'" @change="choose" /></label>
        <p id="phone-upload-help" class="helper">Choose your bank receipt, then submit it below. Your receipt stays private. Submit before {{ new Date(order.expiresAt).toLocaleTimeString('en-MY', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kuala_Lumpur' }) }} MYT.</p>
        <button class="primary full-width" type="submit" :disabled="busy || !file" aria-describedby="phone-upload-help"><LoaderCircle v-if="busy" class="spin" aria-hidden="true" :size="16" />{{ busy ? 'Preparing your receipt…' : 'Submit payment receipt' }}</button>
      </form>
      <p v-else class="helper">This order is no longer accepting receipts. Contact the operator if you have paid.</p>
    </template>
    <p v-if="error" id="phone-upload-error" class="error" role="alert">{{ error }}</p>
  </div>
</template>
