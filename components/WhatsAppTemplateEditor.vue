<script setup lang="ts">
import { MessageCircle } from '~/lib/icons'
import { defaultWhatsAppOpening, renderWhatsAppOpening, whatsAppOpeningMaxLength } from '~/shared/whatsapp'
const admin = useAdmin(), shop = useShop()
const open = ref(false), busy = ref(false), error = ref(''), draft = ref('')
const origin = useRequestURL().origin
const preview = computed(() => renderWhatsAppOpening(draft.value, { name: 'Aina', tag: '#A01' }))
async function edit() {
  draft.value = admin.whatsappOpening.value; error.value = ''; open.value = true
  if (!admin.local) {
    busy.value = true
    try { const saved = await $fetch<{ whatsappOpening: string }>('/api/admin/settings', { headers: admin.headers.value }); draft.value = saved.whatsappOpening; admin.whatsappOpening.value = saved.whatsappOpening }
    catch (e: any) { error.value = e.data?.message || 'Could not load the message template.' }
    finally { busy.value = false }
  }
}
async function save() {
  if (busy.value) return
  if (!draft.value.trim()) { error.value = 'Enter the opening for your WhatsApp message.'; return }
  busy.value = true; error.value = ''
  try {
    if (admin.local) { localStorage.setItem('tebu_whatsapp_opening', draft.value.trim()); admin.whatsappOpening.value = draft.value.trim() }
    else { const saved = await $fetch<{ whatsappOpening: string }>('/api/admin/settings', { method: 'PUT', headers: admin.headers.value, body: { whatsappOpening: draft.value } }); admin.whatsappOpening.value = saved.whatsappOpening }
    open.value = false; shop.notify('WhatsApp template saved.')
  } catch (e: any) { error.value = e.data?.message || 'Could not save the message template.' }
  finally { busy.value = false }
}
</script>
<template>
  <button type="button" class="secondary small-action" @click="edit"><MessageCircle aria-hidden="true" :size="14"/>WhatsApp template</button>
  <RecordDialog :open="open" :busy="busy" title="WhatsApp message template" description="Edit the message opening. Each customer's ticket link is added automatically." @update:open="value => { if (!busy) open = value }">
    <form class="record-form" @submit.prevent="save">
      <label class="field-label" for="whatsapp-opening">Message opening</label>
      <textarea id="whatsapp-opening" v-model="draft" class="input order-remarks-input" rows="5" :disabled="busy" :maxlength="whatsAppOpeningMaxLength" required :aria-invalid="!!error" :aria-describedby="error ? 'whatsapp-template-help whatsapp-template-error' : 'whatsapp-template-help'"/>
      <p id="whatsapp-template-help" class="helper">Use {name} for the customer's name and {tag} for the order number.</p>
      <div class="whatsapp-template-preview"><strong>Preview</strong><p>{{preview}}</p><p class="whatsapp-ticket-preview">{{origin}}/drop?t=example-ticket</p><small>The real ticket link is added for each customer.</small></div>
      <p v-if="error" id="whatsapp-template-error" class="error" role="alert">{{error}}</p>
      <div class="record-form-actions"><button type="button" class="text-button" :disabled="busy" @click="draft = defaultWhatsAppOpening">Reset to default</button><button type="button" class="secondary" :disabled="busy" @click="open = false">Cancel</button><button type="submit" class="primary" :disabled="busy">{{busy?'Saving…':'Save template'}}</button></div>
    </form>
  </RecordDialog>
</template>
