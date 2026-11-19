<script setup lang="ts">
import { Copy, QrCode } from '~/lib/icons'
const props = defineProps<{ token: string }>()
const open = ref(false)
const busy = ref(false)
const error = ref('')
const copied = ref(false)
const link = ref<{ url: string; qr: string; expiresAt: string } | null>(null)
const localTesting = ['localhost', '127.0.0.1', '[::1]'].includes(useRequestURL().hostname)
const panelId = useId()
const panel = ref<HTMLElement | null>(null)
async function toggle() {
  open.value = !open.value
  if (open.value && !link.value) await load()
}
async function load() {
  if (busy.value) return
  busy.value = true; error.value = ''; copied.value = false; link.value = null
  try { link.value = await $fetch<{ url: string; qr: string; expiresAt: string }>(`/api/orders/${props.token}/receipt-link`, { method: 'POST', body: {} }) }
  catch (e: any) { error.value = e.data?.message || 'Could not prepare your upload QR. Please try again.' }
  finally { busy.value = false; await nextTick(); if (open.value) panel.value?.scrollIntoView({ block: 'nearest' }) }
}
async function copyLink() {
  if (!link.value) return
  try { await navigator.clipboard.writeText(link.value.url); copied.value = true; error.value = '' }
  catch { error.value = 'Could not copy the link. Open the upload page and copy its address.' }
}
</script>
<template>
  <div class="phone-receipt">
    <button class="secondary full-width" type="button" :aria-expanded="open" :aria-controls="panelId" @click="toggle"><QrCode aria-hidden="true" :size="18" />{{ open ? 'Hide phone upload QR' : 'Using a laptop? Upload from your phone' }}</button>
    <div v-if="open" :id="panelId" ref="panel" class="phone-receipt-panel" :aria-busy="busy">
      <p v-if="busy" class="helper" role="status">Preparing your upload QR…</p>
      <template v-if="link"><img :src="link.qr" alt="Scan with your phone to upload the receipt for this order" width="300" height="300" /><strong>Scan to upload your receipt</strong><p class="helper">Use your phone camera to open this order’s private upload page. Submit your bank receipt there; this checkout updates automatically.</p><div class="phone-receipt-actions"><a :href="link.url" class="secondary small-action" target="_blank" rel="noopener noreferrer">Open receipt upload page</a><button type="button" class="secondary small-action" @click="copyLink"><Copy aria-hidden="true" :size="14" />Copy upload link</button></div><button type="button" class="text-button" :disabled="busy" @click="load">Refresh upload link</button><p v-if="copied" class="helper" role="status">Upload link copied. Keep it private.</p><p class="helper">For this order only · Expires at {{ new Date(link.expiresAt).toLocaleTimeString('en-MY', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kuala_Lumpur' }) }} MYT.</p></template>
      <p v-if="error" class="error" role="alert">{{ error }}</p>
      <button v-if="error && !link" class="secondary small-action" type="button" :disabled="busy" @click="load">Try again</button>
      <p v-if="localTesting" class="helper">Testing locally? Run <code>bun run dev:lan</code> and connect both devices to the same Wi-Fi.</p>
    </div>
  </div>
</template>
