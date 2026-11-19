<script setup lang="ts">
import { ticketSummary } from '~/shared/domain'
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from '~/components/ui/table'
import { MessageCircle, Pencil } from '~/lib/icons'
import { cartSummary, money, ticketWhatsAppUrl, type Ticket } from '~/shared/domain'
import type { PaymentStatus } from '~/shared/payment'
const props = defineProps<{ orders: Ticket[]; packing?: boolean; busy?: boolean; manage?: boolean }>()
const emit = defineEmits<{ details: [order: Ticket]; edit: [order: Ticket]; payment: [order: Ticket, status: PaymentStatus] }>()
const admin = useAdmin()
const origin = useRequestURL().origin
function placed(value: string) {
  return new Intl.DateTimeFormat('en-MY', { timeZone: 'Asia/Kuala_Lumpur', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value))
}
function openRow(order: Ticket, event: MouseEvent) {
  if (props.busy || (event.target as HTMLElement).closest('button, a, input, select')) return
  // The native details button is also the dialog's focus-return target.
  (event.currentTarget as HTMLElement).querySelector<HTMLButtonElement>('.transaction-open')?.focus({ preventScroll: true })
  emit('details', order)
}
</script>
<template>
  <div class="log-table-card ops-transactions-table">
    <Table class="log-table admin-orders-table">
      <TableCaption class="sr-only">Transactions. Select a customer to view details, or use the payment badge to change payment status.</TableCaption>
      <TableHeader><TableRow><TableHead scope="col">Transaction</TableHead><TableHead scope="col">Items / drop</TableHead><TableHead scope="col">Payment</TableHead><TableHead scope="col" class="text-right"><span class="sr-only">Actions</span></TableHead></TableRow></TableHeader>
      <TableBody>
        <TableRow v-for="order in orders" :key="order.token" :data-token="order.token" class="transaction-row" @click="openRow(order, $event)">
          <TableCell><button type="button" class="transaction-open" :disabled="busy" :aria-label="`View transaction ${order.tag} for ${order.name}`" @click.stop="emit('details', order)"><span class="transaction-reference">{{ order.tag }}</span><strong>{{ order.name }}</strong></button><time class="table-note" :datetime="order.createdAt">{{ placed(order.createdAt) }}<span v-if="order.manualPaymentStatus"> · Manual</span></time><span class="table-note transaction-mobile-drop">Drop {{ order.scheduleId }}</span></TableCell>
          <TableCell><strong>{{ order.varietyName || 'Order items' }}</strong><span class="table-note">{{ ticketSummary(order) }}</span><span class="table-note">Drop · {{ order.scheduleId }}</span><OrderRemarks :value="order.remarks" compact preview /></TableCell>
          <TableCell><strong class="transaction-amount">{{ money(order.total) }}</strong><span v-if="order.refundedTotal" class="table-note">{{order.refundedTotal===order.total?'Refunded':'Part refunded'}} · {{money(order.refundedTotal)}}</span><PaymentStatusControl :order="order" :busy="busy" :readonly="!manage" @change="(order, status) => emit('payment', order, status)" /></TableCell>
          <TableCell><div class="row-actions transaction-row-actions" @click.stop>
            <a v-if="ticketWhatsAppUrl(order, origin, admin.whatsappOpening.value)" class="table-action" :href="ticketWhatsAppUrl(order, origin, admin.whatsappOpening.value)" target="_blank" rel="noopener noreferrer" :aria-label="`WhatsApp ticket ${order.tag} for ${order.name}`" title="Send ticket via WhatsApp"><MessageCircle aria-hidden="true" :size="14" /></a>
            <button v-else class="table-action" type="button" disabled :aria-label="`No phone number for ${order.tag}`" title="No phone number"><MessageCircle aria-hidden="true" :size="14" /></button>
            <button v-if="manage" class="table-action" type="button" :disabled="busy" :aria-label="`Edit transaction ${order.tag} for ${order.name}`" title="Edit transaction" @click="emit('edit', order)"><Pencil aria-hidden="true" :size="14" /></button>
          </div></TableCell>
        </TableRow>
        <TableRow v-if="!orders.length"><TableCell colspan="4" class="table-empty"><strong>{{ busy ? 'Loading transactions…' : 'No matching transactions.' }}</strong><span v-if="!busy">Try another payment status, date or search.</span></TableCell></TableRow>
      </TableBody>
    </Table>
  </div>
</template>
