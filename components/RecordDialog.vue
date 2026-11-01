<script setup lang="ts">
import { DialogRoot, DialogPortal, DialogOverlay, DialogContent, DialogTitle, DialogDescription, DialogClose } from 'reka-ui'
import { X } from 'lucide-vue-next'
const props = defineProps<{ open: boolean; title: string; description: string; busy?: boolean }>()
const emit = defineEmits<{ 'update:open': [value: boolean] }>()
let trigger: HTMLElement | null = null
watch(() => props.open, open => {
  if (open && import.meta.client) trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null
})
function restoreFocus(event: Event) {
  if (!trigger?.isConnected) return
  event.preventDefault()
  trigger.focus({ preventScroll: true })
}
</script>

<template>
  <DialogRoot :open="open" @update:open="value => { if (!busy) emit('update:open', value) }">
    <DialogPortal>
      <DialogOverlay class="record-dialog-overlay" />
      <DialogContent class="record-dialog" :aria-busy="busy" @close-auto-focus="restoreFocus">
        <DialogClose class="icon-button dialog-close" :disabled="busy" aria-label="Close dialog"><X :size="18" aria-hidden="true" /></DialogClose>
        <DialogTitle class="record-dialog-title">{{ title }}</DialogTitle>
        <DialogDescription class="record-dialog-description">{{ description }}</DialogDescription>
        <slot />
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
