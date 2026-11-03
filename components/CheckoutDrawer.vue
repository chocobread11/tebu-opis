<script setup lang="ts">
import { DrawerRoot, DrawerPortal, DrawerOverlay, DrawerContent, DrawerTitle, DrawerDescription } from 'vaul-vue'
import { X, ArrowLeft, ArrowRight, Copy, QrCode, UploadCloud, Check, LoaderCircle, ShieldCheck } from '~/lib/icons'
import { normalizePhone, money, total, cartSummary, type Ticket } from '~/shared/domain'
import { compressImage } from '~/utils/compress'
const shop = useShop()
const config = useRuntimeConfig()
const access = useCustomerAccess()
const protectHistory = ref(false)
const passwordRequired = ref(false)
const password = ref('')
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
watch(shop.checkoutOpen, open => {
  if (!open) return
  error.value = ''; name.value = shop.customerName.value; phone.value = shop.customerPhone.value; password.value = ''; passwordRequired.value = false
  if (shop.checkoutDraft.value) {
    draft.value = shop.checkoutDraft.value; shop.checkoutDraft.value = null
    step.value = 3; submitted.value = false; clearReceipt()
  } else if (submitted.value) {
    step.value = 1; draft.value = null; submitted.value = false; protectHistory.value = false; clearReceipt()
  }
})
function clearReceipt() { if (preview.value) URL.revokeObjectURL(preview.value); preview.value = ''; receipt.value = null; sampleReceipt.value = false }
onBeforeUnmount(clearReceipt)
async function identify() {
  error.value = ''; busy.value = true
  try {
    const chosenDate = shop.selected.value
    await shop.refreshDrops()
    if (chosenDate && chosenDate !== shop.selected.value) throw new Error('The ordering week or availability changed. Please choose your delivery date again.')
    if (!shop.selected.value || !shop.drops.value.some(day => day.id === shop.selected.value && day.remaining > 0)) throw new Error('Choose an open delivery date.')
    if (!shop.variety.value) throw new Error('Choose a tebu variety.')
    const normalized = normalizePhone(phone.value)
    if (name.value.trim().length < 2 || name.value.trim().length > 60) throw new Error('Enter your name (2–60 characters).')
    if (!shop.demo && !config.public.duitnowQr) throw new Error('Ordering opens once the operator configures the DuitNow payment QR.')
    const identity = await access.identify({ phone: normalized, name: name.value.trim(), password: password.value || undefined, protectHistory: protectHistory.value, mode: 'checkout' })
    if (identity.passwordRequired) { passwordRequired.value = true; error.value = 'Enter your history password to continue with this number.'; return }
    if (shop.demo) {
      draft.value = { token: crypto.randomUUID(), tag: `#D${String(shop.tickets.value.length + 1).padStart(2, '0')}`, name: name.value.trim(), phone: normalized, varietyId: shop.varietyId.value, varietyName: shop.variety.value?.name, cart: { ...shop.cart.value }, total: total(shop.cart.value), scheduleId: shop.selected.value, status: 'pending_payment', packed: false, notified: false, createdAt: new Date().toISOString() }
    } else {
      draft.value = await $fetch<Ticket>('/api/orders', { method: 'POST', body: { cart: shop.cart.value, varietyId: shop.varietyId.value, scheduleId: shop.selected.value, requestId: crypto.randomUUID() }, headers: { Authorization: `Bearer ${identity.token}` } })
    }
    if (!shop.tickets.value.some(ticket => ticket.token === draft.value!.token)) shop.tickets.value.unshift(draft.value!)
    shop.persist()
    password.value = ''
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
      draft.value.status = 'pending_review'
      const saved = shop.tickets.value.find(ticket => ticket.token === draft.value!.token)
      if (saved) Object.assign(saved, draft.value)
      else shop.tickets.value.unshift(draft.value)
      shop.persist()
    } else {
      const form = new FormData(); form.append('file', receipt.value!); form.append('orderToken', draft.value.token)
      const uploaded = await $fetch<{ id: string }>('/api/uploads', { method: 'POST', body: form, headers: { Authorization: `Bearer ${shop.customerToken.value}` } })
      const submittedTicket = await $fetch<Ticket>(`/api/orders/${draft.value.token}`, { method: 'PATCH', body: { action: 'receipt', receiptId: uploaded.id }, headers: { Authorization: `Bearer ${shop.customerToken.value}` } })
      draft.value = submittedTicket
      const saved = shop.tickets.value.find(ticket => ticket.token === submittedTicket.token)
      if (saved) Object.assign(saved, submittedTicket)
      else shop.tickets.value.unshift(submittedTicket)
    }
    shop.cart.value = { flask: 0, jug: 0, asam: 0, limau: 0 }; submitted.value = true; step.value = 4
  } catch (e: any) { error.value = e.data?.message || e.message || 'Upload failed. Your order is saved; try again.' } finally { busy.value = false }
}
async function copy(value: string) { try { await navigator.clipboard.writeText(value); shop.notify('Copied to clipboard.') } catch { shop.notify('Copy is unavailable. Select and copy the text.') } }
function viewTicket() { shop.checkoutOpen.value = false; navigateTo(`/drop?t=${draft.value!.token}`) }
</script>
<template>
  <DrawerRoot v-model:open="shop.checkoutOpen.value" direction="bottom" :dismissible="!busy">
    <DrawerPortal><DrawerOverlay class="drawer-overlay"/><DrawerContent class="drawer-content checkout-drawer" :aria-busy="busy">
      <div class="drawer-handle" />
      <div class="drawer-top"><button v-if="step === 3" class="icon-button" aria-label="Back to payment" @click="step = 2"><ArrowLeft aria-hidden="true" :size="18"/></button><span v-else class="eyebrow">{{ shop.demo ? 'DEMO CHECKOUT' : 'CHECKOUT' }}</span><button class="icon-button" :disabled="busy" aria-label="Close checkout" @click="shop.checkoutOpen.value = false"><X aria-hidden="true" :size="18"/></button></div>
      <div v-if="step < 4" class="checkout-steps"><span v-for="(label, i) in ['Details', 'Payment', 'Receipt']" :key="label" :class="{ current: step === i + 1, complete: step > i + 1 }"><b><Check v-if="step > i + 1" aria-hidden="true" :size="12"/><template v-else>{{ i + 1 }}</template></b>{{ label }}</span></div>
      <DrawerTitle class="drawer-title">{{ step === 1 ? 'Your order details' : step === 2 ? 'Pay with DuitNow QR' : step === 3 ? 'Upload payment receipt' : 'Your order receipt is ready' }}</DrawerTitle>
      <DrawerDescription class="drawer-description">{{ step === 1 ? 'We’ll remember your number for past transactions.' : step === 2 ? shop.demo ? 'Demo only. No payment is needed.' : 'Scan or save the QR, then pay the exact total below.' : step === 3 ? 'Attach your bank receipt. We’ll verify your payment.' : 'Payment verification is pending. Save your order ticket below.' }}</DrawerDescription>
      <div class="checkout-stage">
        <form v-if="step === 1" id="checkout-details" @submit.prevent="identify">
          <div class="order-summary"><strong>{{ drop?.full }} · From 9 AM</strong><span>{{ shop.variety.value?.name }} · {{ cartSummary(shop.cart.value, shop.products) }}</span><b>{{ money(shop.amount.value) }}</b></div>
          <label class="field-label" for="phone">Malaysian mobile number</label><div class="phone-field"><span>MY +60</span><input id="phone" v-model="phone" :aria-invalid="!!error" :aria-describedby="error ? 'checkout-error' : undefined" autocomplete="tel" inputmode="tel" placeholder="12 345 6789" required maxlength="20"/></div>
          <label class="field-label" for="name">What should we write on your bag?</label><input id="name" v-model="name" class="input" :aria-invalid="!!error" :aria-describedby="error ? 'checkout-error' : undefined" placeholder="Your first name" autocomplete="given-name" required minlength="2" maxlength="60"/>
          <label v-if="!passwordRequired" class="history-protection-choice"><input v-model="protectHistory" type="checkbox" />Protect my past transactions with a password</label>
          <template v-if="protectHistory || passwordRequired"><label class="field-label" for="checkout-password">{{ passwordRequired ? 'History password' : 'Create history password' }}</label><input id="checkout-password" v-model="password" class="input" type="password" :autocomplete="passwordRequired ? 'current-password' : 'new-password'" required minlength="8" maxlength="128" :aria-invalid="!!error" :aria-describedby="error ? 'checkout-error' : 'history-password-help'"/><p id="history-password-help" class="helper">Use at least 8 characters. Your password is never saved on this device.</p></template>
          <p v-else class="helper">Without a password, anyone who knows your phone number can view your transactions.</p>
        </form>
        <div v-else-if="step === 2" class="payment-card">
          <div class="duitnow-word">DuitNow <b>QR</b></div>
          <PaymentQr v-if="config.public.duitnowQr && !shop.demo" :src="config.public.duitnowQr" />
          <div v-else class="sample-qr"><QrCode aria-hidden="true" :size="128" :stroke-width="1"/><span>SAMPLE · NOT FOR PAYMENT</span></div>
          <strong>{{ config.public.merchantName }}</strong>
          <button class="amount-copy" aria-label="Copy payment amount" @click="copy((draft!.total / 100).toFixed(2))">{{ money(draft!.total) }}<Copy aria-hidden="true" :size="16"/></button>
          <button class="reference-copy" @click="copy(draft!.tag)">Reference: <b>{{ draft!.tag }}</b><Copy aria-hidden="true" :size="13"/></button>
          <a v-if="!shop.demo" class="text-button" :href="config.public.duitnowQr" download="duitnow-qr.jpeg">Save QR image</a>
          <p v-if="!shop.demo" class="helper">Check the recipient in your bank app. Your bottles are reserved for 20 minutes.</p>
        </div>
        <div v-else-if="step === 3">
          <label class="upload-zone"><img v-if="preview" :src="preview" alt="Payment receipt preview"/><template v-else><UploadCloud aria-hidden="true" :size="28"/><strong>{{ busy ? 'Preparing receipt…' : 'Choose payment receipt' }}</strong><span>JPG, PNG or WebP · Up to 12 MB</span></template><input aria-label="Payment receipt" :aria-invalid="!!error" :aria-describedby="error ? 'checkout-error' : 'receipt-help'" type="file" accept="image/jpeg,image/png,image/webp" :disabled="busy" @change="chooseReceipt"/></label>
          <p v-if="receipt" class="success-text"><Check aria-hidden="true" :size="14"/>Receipt attached · {{ Math.round(receipt.size / 1000) }} KB</p>
          <button v-if="shop.demo && !receipt" class="secondary full-width" @click="sampleReceipt = true">{{ sampleReceipt ? '✓ Sample receipt attached' : 'Use a sample receipt' }}</button>
          <p id="receipt-help" class="helper">{{ shop.demo ? 'Demo receipts remain on this device.' : 'Your receipt is private. Payment is confirmed after the operator checks it.' }}</p>
        </div>
        <div v-else class="checkout-success"><span class="big-check"><Check aria-hidden="true" :size="28"/></span><div class="success-tag">{{ draft?.tag }}</div><p>{{ draft?.name }} · {{ money(draft?.total || 0) }}<br>Receipt received · Awaiting payment verification<br>Pickup: Level 7 pantry freezer</p></div>
      </div>
      <div class="checkout-actions">
        <p v-if="error" id="checkout-error" class="error" role="alert">{{ error }}</p>
        <button v-if="step === 1" class="primary full-width" form="checkout-details" type="submit" :disabled="busy"><LoaderCircle v-if="busy" aria-hidden="true" class="spin" :size="16"/>Continue to payment<ArrowRight aria-hidden="true" :size="16"/></button>
        <button v-else-if="step === 2" class="primary full-width" @click="step = 3">{{ shop.demo ? 'Continue demo' : 'I’ve paid — upload receipt' }}<ArrowRight aria-hidden="true" :size="16"/></button>
        <button v-else-if="step === 3" class="primary full-width" :disabled="busy || (!receipt && !sampleReceipt)" aria-describedby="receipt-help" @click="submit"><LoaderCircle v-if="busy" aria-hidden="true" class="spin" :size="16"/>Submit my receipt<ArrowRight aria-hidden="true" :size="16"/></button>
        <button v-else class="primary full-width" @click="viewTicket">View my pickup ticket<ArrowRight aria-hidden="true" :size="16"/></button>
      </div>
    </DrawerContent></DrawerPortal>
  </DrawerRoot>
</template>
