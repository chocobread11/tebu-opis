<script setup lang="ts">
import { DrawerRoot, DrawerPortal, DrawerOverlay, DrawerContent, DrawerTitle, DrawerDescription } from 'vaul-vue'
import { X, ArrowLeft, ArrowRight, Copy, QrCode, UploadCloud, Check, LoaderCircle, ShieldCheck } from 'lucide-vue-next'
import { normalizePhone, money, total, cartSummary, type Ticket } from '~/shared/domain'
import { compressImage } from '~/utils/compress'
const shop = useShop()
const config = useRuntimeConfig()
const step = ref(1)
const name = ref('')
const phone = ref('')
const busy = ref(false)
const error = ref('')
const draft = ref<Ticket | null>(null)
const receipt = shallowRef<File | null>(null)
const preview = ref('')
const submitted = ref(false)
const sampleReceipt = ref(false)
const drop = computed(() => shop.drops.value.find(d => d.id === shop.selected.value))
watch(shop.checkoutOpen, open => { if (open) { error.value = ''; name.value = shop.customerName.value; if (submitted.value) { step.value = 1; draft.value = null; submitted.value = false; clearReceipt() } } })
function clearReceipt() { if (preview.value) URL.revokeObjectURL(preview.value); preview.value = ''; receipt.value = null; sampleReceipt.value = false }
onBeforeUnmount(clearReceipt)
async function identify() {
  error.value = ''; busy.value = true
  try {
    const normalized = normalizePhone(phone.value)
    if (name.value.trim().length < 2 || name.value.trim().length > 60) throw new Error('Enter your name (2–60 characters).')
    if (!shop.demo && !config.public.duitnowQr) throw new Error('Ordering opens once the operator configures the DuitNow payment QR.')
    if (shop.demo) {
      if (!shop.customerToken.value) shop.customerToken.value = crypto.randomUUID()
      draft.value = { token: crypto.randomUUID(), tag: `#D${String(shop.tickets.value.length + 1).padStart(2, '0')}`, name: name.value.trim(), phone: normalized, cart: { ...shop.cart.value }, total: total(shop.cart.value), scheduleId: shop.selected.value, status: 'pending_payment', packed: false, notified: false, createdAt: new Date().toISOString() }
    } else {
      const identity = await $fetch<{ token: string; name: string }>('/api/identity', { method: 'POST', body: { phone: normalized, name: name.value.trim() }, headers: shop.customerToken.value ? { Authorization: `Bearer ${shop.customerToken.value}` } : {} })
      shop.customerToken.value = identity.token
      localStorage.setItem('customer_token', identity.token)
      draft.value = await $fetch<Ticket>('/api/orders', { method: 'POST', body: { cart: shop.cart.value, scheduleId: shop.selected.value, requestId: crypto.randomUUID() }, headers: { Authorization: `Bearer ${identity.token}` } })
    }
    shop.customerName.value = name.value.trim()
    localStorage.setItem('customer_token', shop.customerToken.value); localStorage.setItem('customer_name', shop.customerName.value)
    step.value = 2
  } catch (e: any) { error.value = e.data?.message || e.message || 'Could not start checkout. Please try again.' } finally { busy.value = false }
}
async function chooseReceipt(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  busy.value = true; error.value = ''; clearReceipt()
  try { receipt.value = await compressImage(file); preview.value = URL.createObjectURL(receipt.value) }
  catch (e: any) { error.value = e.message } finally { busy.value = false }
}
async function submit() {
  if (!draft.value || (!receipt.value && !sampleReceipt.value)) return
  error.value = ''; busy.value = true
  try {
    if (shop.demo) {
      draft.value.status = 'pending_review'; shop.tickets.value.unshift(draft.value); shop.persist()
    } else {
      const form = new FormData(); form.append('file', receipt.value!); form.append('orderToken', draft.value.token)
      const uploaded = await $fetch<{ id: string }>('/api/uploads', { method: 'POST', body: form, headers: { Authorization: `Bearer ${shop.customerToken.value}` } })
      draft.value = await $fetch<Ticket>(`/api/orders/${draft.value.token}`, { method: 'PATCH', body: { action: 'receipt', receiptId: uploaded.id }, headers: { Authorization: `Bearer ${shop.customerToken.value}` } })
      shop.tickets.value.unshift(draft.value)
    }
    localStorage.setItem('tebu_latest_ticket', draft.value!.token)
    shop.cart.value = { flask: 0, jug: 0, asam: 0, limau: 0 }; submitted.value = true; step.value = 4
  } catch (e: any) { error.value = e.data?.message || e.message || 'Upload failed. Your order is saved; try again.' } finally { busy.value = false }
}
async function copy(value: string) { try { await navigator.clipboard.writeText(value); shop.notify('Copied to clipboard.') } catch { shop.notify('Copy is unavailable. Select and copy the text.') } }
function viewTicket() { shop.checkoutOpen.value = false; navigateTo(`/drop?t=${draft.value!.token}`) }
</script>
<template>
  <DrawerRoot v-model:open="shop.checkoutOpen.value" :dismissible="!busy">
    <DrawerPortal><DrawerOverlay class="drawer-overlay"/><DrawerContent class="drawer-content">
      <div class="drawer-handle"></div><div class="drawer-top"><button v-if="step === 3" class="icon-button" aria-label="Back to payment" @click="step = 2"><ArrowLeft :size="20"/></button><span v-else class="eyebrow">{{ shop.demo ? 'DEMO CHECKOUT' : 'YOUR NEXT REFRESH' }}</span><button class="icon-button" :disabled="busy" aria-label="Close checkout" @click="shop.checkoutOpen.value = false"><X :size="20"/></button></div>
      <div class="checkout-steps" v-if="step < 4"><span v-for="(label, i) in ['Your details', 'DuitNow', 'Receipt']" :key="label" :class="{ current: step === i + 1, complete: step > i + 1 }"><b><Check v-if="step > i + 1" :size="12"/><template v-else>{{ i + 1 }}</template></b>{{ label }}</span></div>
      <DrawerTitle class="drawer-title">{{ step === 1 ? 'Let’s put your name on it.' : step === 2 ? 'A quick scan. All sorted.' : step === 3 ? 'One last thing.' : 'You’re on the list.' }}</DrawerTitle>
      <DrawerDescription class="drawer-description">{{ step === 1 ? 'No account needed. Just you and your bottle.' : step === 2 ? shop.demo ? 'Sample payment screen. Do not make a payment.' : 'Pay the exact amount with your banking app.' : step === 3 ? 'Upload your payment receipt for a quick check.' : 'Your receipt is in. We’ll check it before confirming your bottle.' }}</DrawerDescription>
      <form v-if="step === 1" @submit.prevent="identify"><div class="order-summary"><strong>{{ drop?.full }} · From 9 AM</strong><span>{{ cartSummary(shop.cart.value) }}</span><b>{{ money(shop.amount.value) }}</b></div><label class="field-label" for="phone">Malaysian mobile number</label><div class="phone-field"><span>MY +60</span><input id="phone" v-model="phone" autocomplete="tel" inputmode="tel" placeholder="12 345 6789" required maxlength="20"/></div><label class="field-label" for="name">What should we write on your bag?</label><input id="name" v-model="name" class="input" placeholder="Your first name" autocomplete="given-name" required minlength="2" maxlength="60"/><p class="privacy-note"><ShieldCheck :size="15"/>Your ticket stays on this device. Keep its link private.</p><p v-if="error" class="error" role="alert">{{ error }}</p><button class="primary full-width" :disabled="busy" type="submit"><LoaderCircle v-if="busy" class="spin" :size="17"/>Continue to payment<ArrowRight :size="17"/></button></form>
      <div v-if="step === 2"><div class="payment-card"><div class="duitnow-word">DuitNow <b>QR</b></div><img v-if="config.public.duitnowQr && !shop.demo" :src="config.public.duitnowQr" alt="Merchant DuitNow payment QR" class="payment-qr"/><div v-else class="sample-qr"><QrCode :size="118" :stroke-width="1"/><span>SAMPLE · NOT FOR PAYMENT</span></div><strong>{{ config.public.merchantName }}</strong><button class="amount-copy" @click="copy((draft!.total / 100).toFixed(2))">{{ money(draft!.total) }}<Copy :size="16"/></button><button class="reference-copy" @click="copy(draft!.tag)">Reference: <b>{{ draft!.tag }}</b><Copy :size="13"/></button></div><p class="helper">{{ shop.demo ? 'This is a demo. Continue to test the receipt step.' : 'Check the merchant name in your bank app before paying. Your bottle is reserved for 20 minutes.' }}</p><button class="primary full-width" @click="step = 3">{{ shop.demo ? 'Continue demo' : 'I’ve paid — upload receipt' }}<ArrowRight :size="17"/></button></div>
      <div v-if="step === 3"><label class="upload-zone"><img v-if="preview" :src="preview" alt="Your compressed receipt preview"/><template v-else><UploadCloud :size="30"/><strong>{{ busy ? 'Compressing your receipt…' : 'Tap to upload your receipt' }}</strong><span>JPG, PNG or WebP · Up to 12 MB</span></template><input type="file" accept="image/jpeg,image/png,image/webp" :disabled="busy" @change="chooseReceipt"/></label><p v-if="receipt" class="success-text"><Check :size="14"/> WebP compressed · {{ Math.round(receipt.size / 1000) }} KB</p><button v-if="shop.demo && !receipt" class="secondary full-width" @click="sampleReceipt = true">{{ sampleReceipt ? '✓ Sample receipt attached' : 'Use a sample receipt' }}</button><p class="helper">{{ shop.demo ? 'Demo receipts remain local and are not uploaded.' : 'Your receipt is private. The pantry operator checks the amount before confirming your order.' }}</p><p v-if="error" class="error" role="alert">{{ error }}</p><button class="primary full-width" :disabled="busy || (!receipt && !sampleReceipt)" @click="submit"><LoaderCircle v-if="busy" class="spin" :size="17"/>Submit my receipt<ArrowRight :size="17"/></button></div>
      <div v-if="step === 4" class="checkout-success"><span class="big-check"><Check :size="32"/></span><div class="success-tag">{{ draft?.tag }}</div><p>{{ draft?.name }}, your {{ shop.demo ? 'demo ' : '' }}ticket is ready.<br>Pickup: Level 7 pantry freezer.</p><button class="primary full-width" @click="viewTicket">View my pickup ticket<ArrowRight :size="17"/></button></div>
    </DrawerContent></DrawerPortal>
  </DrawerRoot>
</template>
