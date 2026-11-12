<script setup lang="ts">
import { money, cartSummary, ticketStatusLabel, type Ticket } from '~/shared/domain'
import { ticketWhatsAppUrl } from '~/shared/domain'
import { MessageCircle, Pencil, Trash2, ExternalLink, Check, X } from '~/lib/icons'
import type { PaymentStatus } from '~/shared/payment'
const props = defineProps<{ order: Ticket | null; busy?: boolean; paymentError?: string }>()
const emit = defineEmits<{ close: []; payment: [order: Ticket, status: PaymentStatus]; edit: [order: Ticket]; delete: [order: Ticket] }>()
const admin = useAdmin()
const origin = useRequestURL().origin
const receiptUrl = ref('')
const receiptBusy = ref(false)
const error = ref('')
function clearReceipt() { if (receiptUrl.value) URL.revokeObjectURL(receiptUrl.value); receiptUrl.value = ''; receiptBusy.value = false; error.value = '' }
watch(() => props.order?.token, () => { clearReceipt(); if (props.order?.receiptId && !admin.local) viewReceipt() })
onBeforeUnmount(clearReceipt)
async function viewReceipt() {
  if (!props.order?.receiptId || admin.local) return
  receiptBusy.value = true; error.value = ''
  const token = props.order.token
  try {
    const blob = await $fetch<Blob>(`/api/media/${props.order.receiptId}`, { headers: admin.headers.value, responseType: 'blob' })
    if (props.order?.token === token) { if (receiptUrl.value) URL.revokeObjectURL(receiptUrl.value); receiptUrl.value = URL.createObjectURL(blob) }
  } catch { if (props.order?.token === token) error.value = 'Could not load the receipt. Please try again.' }
  finally { if (props.order?.token === token) receiptBusy.value = false }
}
</script>
<template>
  <RecordDialog :open="!!order" :title="`Transaction ${order?.tag || ''}`" description="Order details, payment evidence and packing status for this transaction." :busy="busy" @update:open="value => { if (!value) emit('close') }">
    <template v-if="order">
      <div class="transaction-detail-summary"><div><strong>{{ money(order.total) }}</strong><span>{{ order.manualPaymentStatus ? 'Manual order' : 'Online order' }}</span></div><PaymentStatusControl :order="order" :busy="busy" @change="(order, status) => emit('payment', order, status)" /></div>
      <p v-if="paymentError" class="error" role="alert">{{ paymentError }}</p>
      <dl class="transaction-detail-fields"><div><dt>Customer</dt><dd>{{ order.name }}<span class="table-note">{{ order.phone || 'No phone recorded' }}</span></dd></div><div><dt>Drop date</dt><dd>{{ order.scheduleId }}<span class="table-note">Placed {{ new Date(order.createdAt).toLocaleString('en-MY', { timeZone: 'Asia/Kuala_Lumpur' }) }}</span></dd></div><div><dt>Items</dt><dd>{{ order.varietyName }} · {{ cartSummary(order.cart) }}</dd></div><div><dt>Order status</dt><dd>{{ ticketStatusLabel(order) }}</dd></div></dl>
      <OrderRemarks :value="order.remarks" />
      <p v-if="receiptBusy" class="helper" role="status">Loading payment receipt…</p>
      <button v-else-if="order.receiptId && !admin.local && !receiptUrl" class="secondary small-action" @click="viewReceipt">View payment receipt</button>
      <p v-else-if="order.status === 'pending_review' && !order.receiptId" class="helper">{{ admin.local ? 'Sample payment receipt — no real payment in demo mode.' : 'No receipt file is attached.' }}</p>
      <a v-if="receiptUrl" :href="receiptUrl" target="_blank" rel="noopener noreferrer" aria-label="Open full-size payment receipt"><img :src="receiptUrl" alt="Customer payment receipt" class="transaction-receipt-preview" /></a>
      <p v-if="error" class="error" role="alert">{{ error }}</p>
      <div v-if="order.status === 'pending_review' && !order.manualPaymentStatus" class="transaction-review-actions"><button type="button" class="secondary danger" :disabled="busy" @click="emit('payment', order, 'rejected')"><X aria-hidden="true" :size="14" />Reject receipt</button><button type="button" class="primary" :disabled="busy" @click="emit('payment', order, 'paid')"><Check aria-hidden="true" :size="14" />{{ busy ? 'Saving…' : 'Confirm payment' }}</button></div>
      <div class="transaction-detail-actions">
        <a v-if="ticketWhatsAppUrl(order, origin)" :href="ticketWhatsAppUrl(order, origin)" class="secondary small-action" target="_blank" rel="noopener noreferrer"><MessageCircle aria-hidden="true" :size="14" />WhatsApp</a><button v-else type="button" class="secondary small-action" disabled><MessageCircle aria-hidden="true" :size="14" />No phone</button>
        <button type="button" class="secondary small-action" :disabled="busy" @click="emit('edit', order)"><Pencil aria-hidden="true" :size="14" />Edit transaction</button>
        <NuxtLink :to="`/drop?t=${order.token}`" class="secondary small-action" @click="emit('close')"><ExternalLink aria-hidden="true" :size="14" />Customer ticket</NuxtLink>
        <button type="button" class="secondary small-action danger" :disabled="busy" @click="emit('delete', order)"><Trash2 aria-hidden="true" :size="14" />Delete transaction</button>
      </div>
    </template>
  </RecordDialog>
</template>
