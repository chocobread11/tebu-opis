<script setup lang="ts">
import { DrawerRoot, DrawerPortal, DrawerOverlay, DrawerContent, DrawerTitle, DrawerDescription } from 'vaul-vue'
import { X, ArrowLeft, ArrowRight, Copy, QrCode, UploadCloud, Check, LoaderCircle } from '~/lib/icons'
import { normalizePhone, money, emptyCart, total, cartSummary, type Ticket } from '~/shared/domain'
import { compressImage } from '~/utils/compress'
import { reservationExpired, reservationSeconds, orderRemarksMaxLength } from '~/shared/order'
const shop = useShop()
const config = useRuntimeConfig()
const access = useCustomerAccess()
const step = ref(1)
const name = ref('')
const phone = ref('')
const remarks = ref('')
const profileBusy = ref(false)
const profileChecked = ref(false)
const profileMessage = ref('')
let profilePhone = ''
let profileRequest = 0
let profileTimer: ReturnType<typeof setTimeout> | undefined
const busy = ref(false)
const error = ref('')
const draft = ref<Ticket | null>(null)
const receipt = shallowRef<File | null>(null)
const preview = ref('')
const submitted = ref(false)
const sampleReceipt = ref(false)
const now=ref(Date.now())
const expired=computed(()=>!!draft.value&&reservationExpired(draft.value,now.value))
const cancelled=computed(()=>draft.value?.status==='rejected')
const unavailable=computed(()=>expired.value||cancelled.value)
const remaining=computed(()=>{const seconds=draft.value?reservationSeconds(draft.value,now.value):0;return `${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`})
const supportUrl=computed(()=>{const phone=String(shop.publicSettings.value.supportWhatsapp||'').replace(/\D/g,'');return /^60\d{8,11}$/.test(phone)&&draft.value?`https://wa.me/${phone}?text=${encodeURIComponent(`Hi, I already paid for Tebu Drop ${draft.value.tag}. My reservation is unavailable. Please help me submit my receipt.`)}`:''})
function clearCheckoutAttempt(){sessionStorage.removeItem('tebu_checkout_attempt')}
function attemptId(body:unknown){
 const fingerprint=JSON.stringify(body)
 try{const saved=JSON.parse(sessionStorage.getItem('tebu_checkout_attempt')||'null');if(saved?.fingerprint===fingerprint&&/^[0-9a-f-]{36}$/.test(saved.id))return saved.id}catch{}
 const id=crypto.randomUUID();sessionStorage.setItem('tebu_checkout_attempt',JSON.stringify({fingerprint,id}));return id
}
async function restartCheckout(){clearCheckoutAttempt();draft.value=null;step.value=1;submitted.value=false;clearReceipt();await shop.refreshDrops()}
let expiryTimer:ReturnType<typeof setInterval>|undefined
const drop = computed(() => shop.drops.value.find(d => d.id === shop.selected.value))
watch(shop.checkoutOpen, open => {
  if (!open) return
  error.value = ''; name.value = ''; profileChecked.value = false
  phone.value = shop.customerPhone.value
  if (shop.checkoutDraft.value) {
    draft.value = shop.checkoutDraft.value; shop.checkoutDraft.value = null
    step.value = 3; submitted.value = false; clearReceipt()
  } else if (submitted.value) {
    step.value = 1; draft.value = null; submitted.value = false; remarks.value = ''; clearReceipt()
  }
})
function currentPhone() { try { return normalizePhone(phone.value) } catch { return '' } }
async function lookupProfile() {
  const normalized = currentPhone()
  if (!normalized || !shop.checkoutOpen.value || step.value !== 1 || profileChecked.value) return
  const request = ++profileRequest
  profileBusy.value = true; profileMessage.value = 'Checking saved profile…'
  try {
    const result = await access.lookup(normalized)
    if (request !== profileRequest || normalized !== currentPhone()) return
    profileChecked.value = true
    if (result.name && !name.value.trim()) name.value = result.name
    profileMessage.value = result.passwordRequired ? 'Only past transactions need a password. Enter your name to place this order.' : result.found ? 'Saved profile found. You can adjust the name for this bag.' : 'New number. Enter your name to save your profile.'
  } catch { if (request === profileRequest) profileMessage.value = 'Could not check your saved profile. You can try again when continuing.' }
  finally { if (request === profileRequest) profileBusy.value = false }
}
watch([phone, shop.checkoutOpen, step], () => {
  clearTimeout(profileTimer); profileRequest++; profileBusy.value = false
  if (!shop.checkoutOpen.value || step.value !== 1) return
  const normalized = currentPhone()
  if (normalized !== profilePhone) {
    profilePhone = normalized; name.value = ''
    profileChecked.value = false; profileMessage.value = ''; error.value = ''
  }
  if (normalized && !profileChecked.value) {
    profileBusy.value = true; profileMessage.value = 'Checking saved profile…'
    profileTimer = setTimeout(lookupProfile, 350)
  }
})
function clearReceipt() { if (preview.value) URL.revokeObjectURL(preview.value); preview.value = ''; receipt.value = null; sampleReceipt.value = false }
let receiptPoll: ReturnType<typeof setInterval> | undefined
function finishReceipt(ticket: Ticket) {
  draft.value = ticket
  const saved = shop.tickets.value.find(row => row.token === ticket.token)
  if (saved) Object.assign(saved, ticket)
  else shop.tickets.value.unshift(ticket)
  shop.cart.value = emptyCart(shop.products)
  clearCheckoutAttempt();submitted.value = true; step.value = 4; error.value = ''; clearReceipt()
}
async function refreshReceipt() {
  if (shop.demo || !shop.checkoutOpen.value || !draft.value || ![2, 3].includes(step.value) || busy.value || document.hidden) return
  const token = draft.value.token
  try {
    const ticket = await $fetch<Ticket>(`/api/orders/${token}`)
    if(draft.value?.token===token&&['pending_payment','rejected'].includes(ticket.status))draft.value=ticket
    if (draft.value?.token === token && ['pending_review', 'confirmed', 'ready', 'collected'].includes(ticket.status)) finishReceipt(ticket)
  } catch { /* The next poll retries without interrupting checkout. */ }
}
onMounted(() => {
  expiryTimer=setInterval(()=>{if(shop.checkoutOpen.value)now.value=Date.now()},1000)
  receiptPoll = setInterval(refreshReceipt, 5000)
  document.addEventListener('visibilitychange', refreshReceipt)
})
onBeforeUnmount(() => { profileRequest++; clearTimeout(profileTimer); clearReceipt(); clearInterval(receiptPoll);clearInterval(expiryTimer); document.removeEventListener('visibilitychange', refreshReceipt) })
async function identify() {
  if (busy.value || profileBusy.value) return
  error.value = ''; busy.value = true
  try {
    await lookupProfile()
    const normalized = normalizePhone(phone.value)
    const chosenDate = shop.selected.value
    await shop.refreshDrops()
    if (chosenDate && chosenDate !== shop.selected.value) throw new Error('The ordering week or availability changed. Please choose your delivery date again.')
    if (!shop.selected.value || !shop.drops.value.some(day => day.id === shop.selected.value && day.remaining > 0)) throw new Error('Choose an open delivery date.')
    if (name.value.trim().length < 2 || name.value.trim().length > 60) throw new Error('Enter your name (2–60 characters).')
    if (!shop.demo && !config.public.duitnowQr) throw new Error('Ordering opens once the operator configures the DuitNow payment QR.')
    await access.startCheckout({ phone: normalized, name: name.value.trim() })
    if (shop.demo) {
      draft.value = { token: crypto.randomUUID(), tag: `#D${String(shop.tickets.value.length + 1).padStart(2, '0')}`, items: shop.products.filter(p=>shop.cart.value[p.id]).map(p=>({productId:p.id,name:p.name,size:p.size,quantity:shop.cart.value[p.id] ?? 0,unitPrice:p.price,kind:p.kind,spaceCost:p.spaceCost})), name: name.value.trim(), remarks: remarks.value.trim() || undefined, phone: normalized, cart: { ...shop.cart.value }, total: total(shop.cart.value, shop.products), scheduleId: shop.selected.value, status: 'pending_payment', packed: false, notified: false, createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 20 * 60_000).toISOString() }
    } else {
      const body={name:name.value.trim(),remarks:remarks.value.trim()||null,cart:Object.fromEntries(Object.entries(shop.cart.value).filter(([,quantity])=>quantity>0).sort(([a],[b])=>a.localeCompare(b))),scheduleId:shop.selected.value,phone:normalized}
      const requestId=attemptId(body)
      const {phone:_,...orderBody}=body
      draft.value=await $fetch<Ticket>('/api/orders',{method:'POST',body:{...orderBody,requestId}})
    }
    if (!shop.tickets.value.some(ticket => ticket.token === draft.value!.token)) shop.tickets.value.unshift(draft.value!)
    shop.persist()
    now.value=Date.now();step.value = 2
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
  if(unavailable.value){error.value='This reservation is no longer available. Start a new order, or contact the operator if you already paid.';return}
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
      const uploaded = await $fetch<{ id: string }>('/api/uploads', { method: 'POST', body: form })
      const submittedTicket = await $fetch<Ticket>(`/api/orders/${draft.value.token}`, { method: 'PATCH', body: { action: 'receipt', receiptId: uploaded.id } })
      draft.value = submittedTicket
      const saved = shop.tickets.value.find(ticket => ticket.token === submittedTicket.token)
      if (saved) Object.assign(saved, submittedTicket)
      else shop.tickets.value.unshift(submittedTicket)
    }
    shop.cart.value = emptyCart(shop.products);clearCheckoutAttempt(); submitted.value = true; step.value = 4
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
      <DrawerDescription class="drawer-description">{{ step === 1 ? 'No password needed to order. We’ll remember your number for next time.' : step === 2 ? shop.demo ? 'Demo only. No payment is needed.' : 'Pay the amount shown, then upload your bank receipt.' : step === 3 ? 'Attach your bank receipt. We’ll verify your payment.' : 'Payment verification is pending. Save your order ticket below.' }}</DrawerDescription>
      <div v-if="draft && step<4" class="reservation-status" :class="{'reservation-expired':unavailable}" role="status"><strong>{{cancelled?'Order cancelled':expired?'Reservation expired':`Reserved for ${remaining}`}}</strong><p v-if="unavailable">Start a new order to check current availability. If you already paid, contact the operator with your ticket {{draft.tag}}.</p><button v-if="unavailable" type="button" class="secondary small-action" @click="restartCheckout">Start new order</button><a v-if="unavailable&&supportUrl" :href="supportUrl" class="text-button" target="_blank" rel="noopener noreferrer">I already paid — contact operator</a></div>
      <div class="checkout-stage">
        <form v-if="step === 1" id="checkout-details" @submit.prevent="identify">
          <div class="order-summary"><strong>{{ drop?.full }} · From 9 AM</strong><span>{{ cartSummary(shop.cart.value, shop.products) }}</span><b>{{ money(shop.amount.value) }}</b></div>
          <label class="field-label" for="phone">Malaysian mobile number</label><div class="phone-field"><span>MY +60</span><input id="phone" :disabled="busy" v-model="phone" :aria-invalid="!!error" :aria-describedby="error ? 'checkout-error' : 'checkout-profile-status'" autocomplete="tel" inputmode="tel" placeholder="12 345 6789" required maxlength="20"/></div>
          <p id="checkout-profile-status" class="helper" role="status">{{ profileMessage || 'Enter your number to find your saved profile.' }}</p>
          <label class="field-label" for="name">What should we write on your bag?</label><input id="name" :disabled="busy" v-model="name" class="input" :aria-invalid="!!error" :aria-describedby="error ? 'checkout-error' : undefined" placeholder="Your first name" autocomplete="given-name" required minlength="2" maxlength="60"/>
          <label class="field-label" for="checkout-remarks">Remarks (optional)</label><textarea id="checkout-remarks" :disabled="busy" v-model="remarks" class="input order-remarks-input" rows="3" :maxlength="orderRemarksMaxLength" placeholder="Anything we should know about your order?" aria-describedby="checkout-remarks-help" /><p id="checkout-remarks-help" class="helper">For this order only · Up to {{ orderRemarksMaxLength }} characters.</p>
        </form>
        <p v-else-if="unavailable" class="helper">Payment and receipt upload are unavailable for this reservation.</p>
        <div v-else-if="step === 2" class="payment-card">
          <div class="payment-amount"><span>Amount to pay</span><button class="amount-copy" type="button" aria-label="Copy payment amount" @click="copy((draft!.total / 100).toFixed(2))">{{ money(draft!.total) }}<Copy aria-hidden="true" :size="18"/></button><small>Tap to copy the amount</small></div>
          <div class="duitnow-word">DuitNow <b>QR</b></div>
          <PaymentQr v-if="config.public.duitnowQr && !shop.demo" :src="config.public.duitnowQr" />
          <div v-else class="sample-qr"><QrCode aria-hidden="true" :size="128" :stroke-width="1"/><span>SAMPLE · NOT FOR PAYMENT</span></div>
          <strong>{{ shop.publicSettings.value.merchantName }}</strong>
          <a v-if="!shop.demo" class="secondary full-width payment-qr-download" :href="config.public.duitnowQr" download="tebu-payment-qr.jpeg"><QrCode aria-hidden="true" :size="18"/>Download payment QR</a>
          <p v-if="!shop.demo" class="helper">Save the QR, open it in your banking app, and pay the amount above. We’ll match your payment using the receipt.</p>
          <span class="payment-order-tag">Order {{ draft?.tag }}</span>
          <OrderRemarks :value="draft?.remarks" />
          <p v-if="!shop.demo" class="helper">Check the recipient in your bank app. Your bottles are reserved for 20 minutes.</p>
        </div>
        <div v-else-if="step === 3">
          <div class="order-summary"><strong>{{ draft?.tag }} · {{ money(draft?.total || 0) }}</strong><span>Upload your receipt here or from your phone below.</span></div>
          <label class="upload-zone"><img v-if="preview" :src="preview" alt="Payment receipt preview"/><template v-else><UploadCloud aria-hidden="true" :size="28"/><strong>{{ busy ? 'Preparing receipt…' : 'Choose payment receipt' }}</strong><span>JPG, PNG or WebP · Up to 12 MB</span></template><input aria-label="Payment receipt" :aria-invalid="!!error" :aria-describedby="error ? 'checkout-error' : 'receipt-help'" type="file" accept="image/jpeg,image/png,image/webp" :disabled="busy" @change="chooseReceipt"/></label>
          <p v-if="receipt" class="success-text"><Check aria-hidden="true" :size="14"/>Receipt attached · {{ Math.round(receipt.size / 1000) }} KB</p>
          <button v-if="shop.demo && !receipt" class="secondary full-width" @click="sampleReceipt = true">{{ sampleReceipt ? '✓ Sample receipt attached' : 'Use a sample receipt' }}</button>
          <p id="receipt-help" class="helper">{{ shop.demo ? 'Demo receipts remain on this device.' : 'Your receipt is private. Payment is confirmed after the operator checks it.' }}</p>
        </div>
        <div v-else class="checkout-success"><span class="big-check"><Check aria-hidden="true" :size="28"/></span><div class="success-tag">{{ draft?.tag }}</div><p>{{ draft?.name }} · {{ money(draft?.total || 0) }}<br>Receipt received · Awaiting payment verification<br>Pickup: Level 7 pantry freezer</p><OrderRemarks :value="draft?.remarks" /></div>
        <PhoneReceipt v-if="!shop.demo && draft && !unavailable && (step === 2 || step === 3)" :key="draft.token" :token="draft.token" />
      </div>
      <div class="checkout-actions">
        <p v-if="error" id="checkout-error" class="error" role="alert">{{ error }}</p>
        <button v-if="step === 1" class="primary full-width" form="checkout-details" type="submit" :disabled="busy || profileBusy"><LoaderCircle v-if="busy" aria-hidden="true" class="spin" :size="16"/>{{ profileBusy ? 'Checking profile…' : 'Continue to payment' }}<ArrowRight aria-hidden="true" :size="16"/></button>
        <button v-else-if="step === 2" class="primary full-width" :disabled="unavailable" @click="step = 3">{{ shop.demo ? 'Continue demo' : 'I’ve paid — upload receipt' }}<ArrowRight aria-hidden="true" :size="16"/></button>
        <button v-else-if="step === 3" class="primary full-width" :disabled="busy || unavailable || (!receipt && !sampleReceipt)" aria-describedby="receipt-help" @click="submit"><LoaderCircle v-if="busy" aria-hidden="true" class="spin" :size="16"/>Submit my receipt<ArrowRight aria-hidden="true" :size="16"/></button>
        <button v-else class="primary full-width" @click="viewTicket">View my pickup ticket<ArrowRight aria-hidden="true" :size="16"/></button>
      </div>
    </DrawerContent></DrawerPortal>
  </DrawerRoot>
</template>
