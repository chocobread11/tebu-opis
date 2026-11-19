<script setup lang="ts">
import { DropdownMenuRoot, DropdownMenuTrigger, DropdownMenuPortal, DropdownMenuContent, DropdownMenuItem } from 'reka-ui'
import { Check, ChevronDown } from '~/lib/icons'
import { paymentStatus, paymentLabel, paymentLabels, paymentOptions, type PaymentStatus } from '~/shared/payment'
import type { Ticket } from '~/shared/domain'
defineProps<{ order: Ticket; busy?: boolean; readonly?: boolean }>()
const emit = defineEmits<{ change: [order: Ticket, status: PaymentStatus] }>()
const descriptions: Record<PaymentStatus, string> = { unpaid: 'Request a new receipt', review: 'Review attached receipt', paid: 'Confirm payment received', rejected: 'Release the reserved bottles' }
</script>
<template>
  <span v-if="readonly || paymentOptions(order).length<=1" :class="['payment-status', `payment-status-${paymentStatus(order)}`]">{{ paymentLabel(order) }}</span>
  <DropdownMenuRoot v-else>
    <DropdownMenuTrigger as-child><button type="button" :class="['payment-status', 'payment-status-control', `payment-status-${paymentStatus(order)}`]" :disabled="busy" :aria-label="`Change payment for ${order.tag} ${order.name}: ${paymentLabel(order)}`" @click.stop><span class="payment-status-dot" aria-hidden="true" />{{ paymentLabel(order) }}<ChevronDown aria-hidden="true" :size="12" /></button></DropdownMenuTrigger>
    <DropdownMenuPortal><DropdownMenuContent class="transaction-actions-menu payment-status-menu" align="start" :side-offset="6">
      <DropdownMenuItem v-for="status in paymentOptions(order)" :key="status" class="transaction-menu-item payment-status-option" :aria-label="`Mark payment ${paymentLabels[status].toLowerCase()}`" :disabled="busy || status === paymentStatus(order)" @select="emit('change', order, status)">
        <span><strong>{{ paymentLabels[status] }}</strong><small>{{ order.manualPaymentStatus ? `Mark this manual order ${status}` : descriptions[status] }}</small></span><Check v-if="status === paymentStatus(order)" aria-hidden="true" :size="14" />
      </DropdownMenuItem>
    </DropdownMenuContent></DropdownMenuPortal>
  </DropdownMenuRoot>
</template>
