<script setup lang="ts">
import { RefreshCw } from 'lucide-vue-next'
import { malaysiaToday } from '~/shared/domain'
const shop = useShop()
const admin = useAdmin()
const selected = ref(malaysiaToday())
const busy = ref(false)
const error = ref('')
async function refresh() {
  busy.value = true; error.value = ''
  try { await shop.refreshDrops(); await admin.refresh() }
  catch (e: any) { error.value = e.data?.message || 'Could not load the calendar and manual orders.' }
  finally { busy.value = false }
}
watch(admin.authenticated, value => { if (value && !admin.local) refresh() })
onMounted(async () => { if (admin.local || admin.authenticated.value) await refresh() })
</script>
<template>
  <div class="inner-page ops-page" :aria-busy="busy">
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <AdminLogin v-if="!admin.authenticated.value" />
    <template v-else>
      <p class="ops-caption">Choose a date to manage its availability, bottle limits and manual orders.</p>
      <AdminSchedule v-model="selected" @changed="refresh" />
      <AdminManualOrders :schedule-id="selected" @changed="refresh" />
      <div class="admin-refresh"><span>Changes apply to your public delivery calendar.</span><button :disabled="busy" @click="refresh"><RefreshCw aria-hidden="true" :size="12" />Refresh</button></div>
    </template>
  </div>
</template>
