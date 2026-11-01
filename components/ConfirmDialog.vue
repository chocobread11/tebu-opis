<script setup lang="ts">
import { AlertDialogRoot, AlertDialogPortal, AlertDialogOverlay, AlertDialogContent, AlertDialogTitle, AlertDialogDescription, AlertDialogCancel } from 'reka-ui'
const props = withDefaults(defineProps<{ open: boolean; title: string; description: string; confirmLabel: string; cancelLabel?: string; destructive?: boolean; busy?: boolean; error?: string }>(), { cancelLabel: 'Cancel', destructive: true })
const emit = defineEmits<{ 'update:open': [value: boolean]; confirm: [] }>()
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
  <AlertDialogRoot :open="open" @update:open="value => { if (!busy) emit('update:open', value) }">
    <AlertDialogPortal>
      <AlertDialogOverlay class="record-dialog-overlay" />
      <AlertDialogContent class="record-dialog confirmation-dialog" :aria-busy="busy" @close-auto-focus="restoreFocus">
        <AlertDialogTitle class="record-dialog-title">{{ title }}</AlertDialogTitle>
        <AlertDialogDescription class="record-dialog-description">{{ description }}</AlertDialogDescription>
        <p v-if="error" class="error" role="alert">{{ error }}</p>
        <div class="record-form-actions">
          <AlertDialogCancel class="secondary" :disabled="busy">{{ cancelLabel }}</AlertDialogCancel>
          <button type="button" :class="destructive ? 'delete-button' : 'primary'" :disabled="busy" @click="emit('confirm')">{{ busy ? 'Saving…' : confirmLabel }}</button>
        </div>
      </AlertDialogContent>
    </AlertDialogPortal>
  </AlertDialogRoot>
</template>
