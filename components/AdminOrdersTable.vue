<script setup lang="ts">
import { cartSummary, money, type Ticket } from '~/shared/domain'
const props = defineProps<{ orders: Ticket[]; packing?: boolean; busy?: boolean; manage?: boolean }>()
const emit = defineEmits<{ pack: [order: Ticket, packed: boolean]; details: [order: Ticket]; edit: [order: Ticket]; delete: [order: Ticket] }>()
function placed(value: string) {
  const date = new Date(value)
  const day = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kuala_Lumpur', day: 'numeric', month: 'numeric', year: 'numeric' }).format(date)
  const time = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kuala_Lumpur', hour: 'numeric', minute: '2-digit', hour12: true }).format(date).replace(/\s/g, '')
  return `${day} - ${time}`
}
</script>
<template>
  <div class="log-table-card ops-transactions-table">
    <table class="log-table transaction-table"><caption class="sr-only">{{ manage ? 'Transaction history' : packing ? 'Packing transactions' : 'Drop status and contact actions' }}</caption>
      <thead><tr><th scope="col">Transaction</th><th scope="col">Items</th><th scope="col">Payment</th><th scope="col">Action</th></tr></thead>
      <tbody><tr v-for="order in orders" :key="order.token" :data-token="order.token" :class="{ 'transaction-packed': order.packed }">
        <td><strong>{{ order.tag }} · {{ order.name }}</strong><span class="table-note">{{ placed(order.createdAt) }}</span></td>
        <td><strong v-if="order.varietyName">{{ order.varietyName }}</strong><span class="table-note">{{ cartSummary(order.cart) }}</span></td>
        <td><strong>{{ money(order.total) }}</strong><span class="table-note">{{ order.manualPaymentStatus ? `Manual · ${order.manualPaymentStatus}` : order.status === 'pending_review' ? 'Receipt under review' : order.status === 'pending_payment' ? 'Awaiting receipt' : order.status === 'rejected' ? 'Rejected' : 'Payment confirmed' }}</span></td>
        <td>
          <TransactionActionsMenu :order="order" :manage="manage" :busy="busy" @details="emit('details', $event)" @edit="emit('edit', $event)" @delete="emit('delete', $event)" />
        </td>
      </tr><tr v-if="!orders.length"><td colspan="4" class="table-empty"><strong>No matching transactions.</strong><span>Try another date or search, or add a manual order.</span></td></tr></tbody>
    </table>
  </div>
</template>
