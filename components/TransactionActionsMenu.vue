<script setup lang="ts">
import { ticketWhatsAppUrl, type Ticket } from '~/shared/domain'
import { MessageCircle } from '~/lib/icons'
import { DropdownMenuRoot, DropdownMenuTrigger, DropdownMenuPortal, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from 'reka-ui'
withDefaults(defineProps<{ order: Ticket; manage?: boolean; busy?: boolean; showDetails?: boolean }>(), { showDetails: true })
const emit = defineEmits<{ details: [order: Ticket]; edit: [order: Ticket]; delete: [order: Ticket] }>()
const origin = useRequestURL().origin
</script>
<template>
          <DropdownMenuRoot><DropdownMenuTrigger as-child><button type="button" class="secondary transaction-menu-trigger" :disabled="busy" :aria-label="`Actions for ${order.tag} ${order.name}`"><svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/></svg></button></DropdownMenuTrigger>
            <DropdownMenuPortal><DropdownMenuContent class="transaction-actions-menu" align="end" :side-offset="6">
              <DropdownMenuItem v-if="showDetails" class="transaction-menu-item" :aria-label="`Transaction details ${order.tag}`" @select="emit('details', order)">Details</DropdownMenuItem>
              <DropdownMenuItem v-if="ticketWhatsAppUrl(order, origin)" as-child class="transaction-menu-item"><a :href="ticketWhatsAppUrl(order, origin)" target="_blank" rel="noopener noreferrer" :aria-label="`WhatsApp ticket ${order.tag}`"><MessageCircle aria-hidden="true" :size="14" />Send status via WhatsApp</a></DropdownMenuItem>
              <DropdownMenuItem v-else class="transaction-menu-item" disabled>WhatsApp · no phone number</DropdownMenuItem>
              <template v-if="manage"><DropdownMenuSeparator class="transaction-menu-separator" /><DropdownMenuItem class="transaction-menu-item" :aria-label="`Edit transaction ${order.tag} for ${order.name}`" @select="emit('edit', order)">Edit</DropdownMenuItem><DropdownMenuItem class="transaction-menu-item danger" :aria-label="`Delete transaction ${order.tag} for ${order.name}`" @select="emit('delete', order)">Delete</DropdownMenuItem></template>
            </DropdownMenuContent></DropdownMenuPortal>
          </DropdownMenuRoot>
</template>
