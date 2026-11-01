<script setup lang="ts">
import type { CaneStock } from '~/shared/domain'
const admin = useAdmin()
const shop = useShop()
const editing = ref<CaneStock | null>(null)
const form = reactive({ name: '', description: '' })
const busy = ref(false)
const error = ref('')
const emit = defineEmits<{ changed: [] }>()
function edit(variety: CaneStock) { editing.value = variety; form.name = variety.name; form.description = variety.description; error.value = '' }
async function save() {
  if (!editing.value) return
  busy.value = true; error.value = ''
  try {
    if (!admin.local) await $fetch('/api/admin/varieties', { method: 'PATCH', headers: admin.headers.value, body: { id: editing.value.id, ...form } })
    else {
      Object.assign(editing.value, form)
      const publicVariety = shop.varieties.value.find(row => row.id === editing.value!.id)
      if (publicVariety) Object.assign(publicVariety, form)
    }
    editing.value = null; emit('changed')
  } catch (e: any) { error.value = e.data?.message || 'Could not save this variety.' }
  finally { busy.value = false }
}
</script>
<template>
  <section class="stock-section" aria-label="Tebu bottle stock"><div class="section-heading"><div><h2>Our two tebu.</h2><p class="ops-caption">These names and available bottles appear on the public menu.</p></div></div><div class="stock-cards"><article v-for="variety in admin.varieties.value" :key="variety.id" class="stock-card"><div class="section-heading"><strong>{{ variety.name }}</strong><button class="text-button" :aria-label="`Edit variety ${variety.name}`" @click="edit(variety)">Edit</button></div><p v-if="variety.description" class="helper">{{ variety.description }}</p><dl><div><dt>500 ml flask</dt><dd><b>{{ Math.max(0, variety.flaskRemaining) }}</b> available <small>/ {{ variety.flaskQty }} bottled</small></dd></div><div><dt>1 litre jug</dt><dd><b>{{ Math.max(0, variety.jugRemaining) }}</b> available <small>/ {{ variety.jugQty }} bottled</small></dd></div></dl></article></div><p class="helper">Log ready bottles below to update stock. Orders reserve them automatically.</p></section>
  <RecordDialog :busy="busy" :open="!!editing" title="Name your tebu." description="Customers will see this variety name and description before ordering." @update:open="editing = $event ? editing : null"><form class="record-form" @submit.prevent="save"><label class="field-label" for="variety-name">Variety name</label><input id="variety-name" :aria-invalid="!!error" :aria-describedby="error ? 'variety-error' : undefined" v-model="form.name" class="input" maxlength="60" required /><label class="field-label" for="variety-description">Description optional</label><input id="variety-description" :aria-invalid="!!error" :aria-describedby="error ? 'variety-error' : undefined" v-model="form.description" class="input" maxlength="240" /><p v-if="error" id="variety-error" class="error" role="alert">{{ error }}</p><div class="record-form-actions"><button class="secondary" type="button" :disabled="busy" @click="editing = null">Cancel</button><button class="primary" :disabled="busy">Save variety</button></div></form></RecordDialog>
</template>
