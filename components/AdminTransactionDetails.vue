<script setup lang="ts">
import { money, cartSummary, ticketStatusLabel, type Ticket } from '~/shared/domain'
const props = defineProps<{ order: Ticket | null; busy?: boolean }>()
const emit = defineEmits<{ close: []; action: [order: Ticket, action: 'approve' | 'reject'] }>()
const admin = useAdmin()
const receiptUrl = ref('')
const receiptBusy = ref(false)
const error = ref('')
function clearReceipt() { if (receiptUrl.value) URL.revokeObjectURL(receiptUrl.value); receiptUrl.value = ''; error.value = '' }
watch(() => props.order?.token, clearReceipt)
onBeforeUnmount(clearReceipt)
async function viewReceipt() {
  if (!props.order?.receiptId || admin.local) return
  receiptBusy.value = true; error.value = ''
  const token = props.order.token
  try {
    const blob = await $fetch<Blob>(`/api/media/${props.order.receiptId}`, { headers: admin.headers.value, responseType: 'blob' })
    if (props.order?.token === token) receiptUrl.value = URL.createObjectURL(blob)
  } catch { error.value = 'Could not load the receipt. Please try again.' }
  finally { receiptBusy.value = false }
}
</script>
<template>
  <RecordDialog :open="!!order" :title="`Transaction ${order?.tag || ''}`" description="Order details, payment evidence and packing status for this transaction." :busy="busy" @update:open="value => { if (!value) emit('close') }">
    <template v-if="order">
      <dl class="transaction-detail-fields"><div><dt>Customer</dt><dd>{{ order.name }} · {{ order.phone || 'No phone recorded' }}</dd></div><div><dt>Placed / drop</dt><dd>{{ new Date(order.createdAt).toLocaleString('en-MY', { timeZone: 'Asia/Kuala_Lumpur' }) }} / {{ order.scheduleId }}</dd></div><div><dt>Items</dt><dd>{{ order.varietyName }} · {{ cartSummary(order.cart) }}</dd></div><div><dt>Total / payment</dt><dd>{{ money(order.total) }} · {{ order.manualPaymentStatus || order.status }}</dd></div><div><dt>Packing / drop</dt><dd>{{ order.packed ? 'Packed' : 'Not packed' }} · {{ ticketStatusLabel(order) }}</dd></div></dl>
      <NuxtLink :to="`/drop?t=${order.token}`" class="text-button" @click="emit('close')">Open customer ticket</NuxtLink>
      <button v-if="order.receiptId && !admin.local" class="secondary full-width" :disabled="receiptBusy" @click="viewReceipt">{{ receiptBusy ? 'Loading receipt…' : 'View payment receipt' }}</button>
      <p v-else-if="order.status === 'pending_review'" class="helper">{{ admin.local ? 'Sample payment receipt — no real payment in demo mode.' : 'No receipt file is attached.' }}</p>
      <img v-if="receiptUrl" :src="receiptUrl" alt="Customer payment receipt" class="transaction-receipt-preview" />
      <p v-if="error" class="error" role="alert">{{ error }}</p>
      <div v-if="order.status === 'pending_review'" class="record-form-actions"><button class="secondary danger" :disabled="busy" @click="emit('action', order, 'reject')">Needs attention</button><button class="primary" :disabled="busy" @click="emit('action', order, 'approve')">Confirm payment</button></div>
    </template>
  </RecordDialog>
</template>
