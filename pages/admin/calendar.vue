<script setup lang="ts">
import { RefreshCw } from '~/lib/icons'
import { malaysiaToday } from '~/shared/domain'
const shop = useShop()
const admin = useAdmin()
const route = useRoute()
function linkedDate() { return typeof route.query.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(route.query.date) ? route.query.date : malaysiaToday() }
const selected = ref(linkedDate())
watch(() => route.query.date, () => { selected.value = linkedDate() })
const busy = ref(false)
const error = ref('')
const revision = ref(0)
async function refresh() {
  busy.value = true; error.value = ''
  try { await shop.refreshDrops(); await admin.refresh(); revision.value++ }
  catch (e: any) { error.value = e.data?.message || 'Could not load the calendar and manual orders.' }
  finally { busy.value = false }
}
watch(admin.authenticated, value => { if (value && !admin.local) refresh() })
onMounted(async () => { if (admin.local || admin.authenticated.value) await refresh() })
</script>
<template>
  <div class="inner-page ops-page calendar-page" :aria-busy="busy">
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <AdminLogin v-if="!admin.authenticated.value" />
    <template v-else>
      <AdminManualOrders :schedule-id="selected" create-only @changed="refresh" />
      <AdminSchedule v-model="selected" @changed="refresh" />
      <AdminTransactions :schedule-id="selected" :revision="revision" @changed="refresh" />
      <div class="admin-refresh"><span>Changes apply to your public delivery calendar.</span><button :disabled="busy" @click="refresh"><RefreshCw aria-hidden="true" :size="12" />Refresh</button></div>
    </template>
  </div>
</template>
