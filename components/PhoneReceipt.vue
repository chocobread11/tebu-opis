<script setup lang="ts">
const props = defineProps<{ token: string }>()
const shop = useShop()
const open = ref(false)
const busy = ref(false)
const error = ref('')
const link = ref<{ url: string; qr: string; expiresAt: string } | null>(null)
const panelId = useId()
const panel = ref<HTMLElement | null>(null)
async function toggle() {
  open.value = !open.value
  if (!open.value || link.value) return
  busy.value = true; error.value = ''
  try { link.value = await $fetch<{ url: string; qr: string; expiresAt: string }>(`/api/orders/${props.token}/receipt-link`, { method: 'POST', body: {} }) }
  catch (e: any) { error.value = e.data?.message || 'Could not prepare your upload QR. Please try again.' }
  finally { busy.value = false; await nextTick(); panel.value?.scrollIntoView({ block: 'nearest' }) }
}
</script>
<template>
  <div class="phone-receipt">
    <button class="text-button" type="button" :aria-expanded="open" :aria-controls="panelId" @click="toggle">{{ open ? 'Hide phone upload QR' : 'Upload it from my phone' }}</button>
    <div v-if="open" :id="panelId" ref="panel" class="phone-receipt-panel" :aria-busy="busy">
      <p v-if="busy" class="helper" role="status">Preparing your upload QR…</p>
      <template v-if="link"><img :src="link.qr" alt="Scan with your phone to upload the receipt for this order" width="300" height="300" /><strong>Scan to upload your receipt</strong><p class="helper">Open your phone camera, scan this code and choose your bank receipt. This checkout updates automatically.</p><a :href="link.url" class="text-button" target="_blank" rel="noopener noreferrer">Open receipt upload page</a><p class="helper">For this order only · Expires with your reservation.</p></template>
      <p v-if="error" class="error" role="alert">{{ error }}</p>
    </div>
  </div>
</template>
