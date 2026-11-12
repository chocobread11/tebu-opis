<script setup lang="ts">
import { NativeSelect, NativeSelectOption } from '~/components/ui/native-select'
import { dailyBottleCapacity, bottleSpaces, malaysiaToday, type CalendarDay } from '~/shared/domain'
const props = defineProps<{ modelValue: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: string]; changed: [] }>()
const admin = useAdmin()
const shop = useShop()
const month = ref(props.modelValue.slice(0, 7) || malaysiaToday().slice(0, 7))
const selected = computed({ get: () => props.modelValue, set: value => emit('update:modelValue', value) })
const days = computed<CalendarDay[]>(() => admin.local ? shop.days.value : admin.schedules.value)
const current = computed(() => days.value.find(day => day.id === selected.value))
const form = reactive<{ status: string; capacity: number | undefined }>({ status: 'open', capacity: dailyBottleCapacity })
const busy = ref(false)
const error = ref('')
const confirmRemove = ref(false)
const editable = computed(() => selected.value > malaysiaToday() && !current.value?.droppedAt)
const committed = computed(() => admin.orders.value.filter(order => order.scheduleId === selected.value && ['pending_review', 'confirmed', 'ready'].includes(order.status)).length)
watch([selected, () => JSON.stringify(current.value)], () => {
  form.status = current.value?.open ? 'open' : ['MC', 'AL'].includes(current.value?.closedReason || '') ? current.value!.closedReason! : 'Other'
  form.capacity = current.value?.capacity ?? dailyBottleCapacity
  error.value = ''
}, { immediate: true })
watch(selected, id => { if (id) month.value = id.slice(0, 7) })
async function save(remove = false) {
  if (!editable.value) return
  busy.value = true; error.value = ''
  try {
    if (admin.local) {
      const used = admin.orders.value.filter(order => order.scheduleId === selected.value && order.status !== 'rejected' && (order.status !== 'pending_payment' || !!order.expiresAt && new Date(order.expiresAt).getTime() > Date.now())).reduce((sum, order) => sum + bottleSpaces(order.cart), 0)
      if (!Number.isInteger(form.capacity) || Number(form.capacity) < Math.max(1, used)) throw new Error('Box capacity must cover existing reservations.')
      const row: CalendarDay = { id: selected.value, capacity: Number(form.capacity), kecikCapacity: Number(form.capacity), besarCapacity: Math.floor(Number(form.capacity) / 2), remaining: Number(form.capacity), open: !remove && form.status === 'open', closedReason: remove ? 'Removed' : form.status === 'open' ? null : form.status, removedAt: remove ? new Date().toISOString() : null }
      const existing = shop.days.value.findIndex(day => day.id === row.id)
      if (existing < 0) shop.days.value.push(row); else shop.days.value[existing] = row
      shop.syncDemoCalendar()
    } else {
      if (remove) await $fetch(`/api/admin/schedules/${selected.value}`, { method: 'DELETE', headers: admin.headers.value })
      else await $fetch(`/api/admin/schedules/${selected.value}`, { method: 'PUT', headers: admin.headers.value, body: { open: form.status === 'open', capacity: Number(form.capacity), ...(form.status === 'open' ? {} : { reason: form.status }) } })
      await admin.refresh()
    }
    confirmRemove.value = false
    shop.notify(remove ? 'Day removed from ordering.' : 'Calendar saved.')
    emit('changed')
  } catch (e: any) { error.value = e.data?.message || e.message || 'Could not update this date.' }
  finally { busy.value = false }
}
</script>
<template>
  <section class="admin-drop-picker">
    <MonthCalendar v-model="selected" v-model:month="month" :days="days" admin :loading="busy" />
    <div v-if="selected" class="calendar-editor">
      <div class="section-heading"><strong>{{ selected }}</strong><span class="ops-badge">{{ current?.removedAt ? 'Removed' : current?.open ? 'Open' : 'Closed' }}</span></div>
      <p v-if="!editable" class="helper">Past dates and delivered drops are kept here for your records.</p>
      <form v-else @submit.prevent="save()">
        <div class="calendar-editor-fields"><div><label class="field-label" for="day-status">Day status</label><NativeSelect id="day-status" :aria-invalid="!!error" :aria-describedby="error ? 'schedule-error' : undefined" v-model="form.status"><NativeSelectOption value="open">Open for orders</NativeSelectOption><NativeSelectOption value="MC">Closed · MC</NativeSelectOption><NativeSelectOption value="AL">Closed · AL</NativeSelectOption><NativeSelectOption value="Other">Closed · Other</NativeSelectOption></NativeSelect></div><div><label class="field-label" for="day-capacity">Box capacity (spaces)</label><NumberInput id="day-capacity" :aria-invalid="!!error" :aria-describedby="error ? 'schedule-error' : 'box-capacity-help'" v-model="form.capacity" label="box capacity in spaces" :min="1" :max="10000" required /></div></div>
        <p id="box-capacity-help" class="helper">Kecik uses 1 space; Besar uses 2. {{ form.capacity || 0 }} spaces fit up to {{ form.capacity || 0 }} Kecik or {{ Math.floor(Number(form.capacity || 0) / 2) }} Besar, or any mix.</p>
        <p v-if="committed" class="helper">{{ committed }} active order{{ committed === 1 ? '' : 's' }} need your follow-up if you close this date.</p>
        <p v-if="error" id="schedule-error" class="error" role="alert">{{ error }}</p>
        <div class="record-form-actions"><button class="secondary danger" type="button" :disabled="busy" @click="confirmRemove = true">Remove day</button><button class="primary" :disabled="busy">Save day</button></div>
      </form>
    </div>
    <ConfirmDialog :open="confirmRemove" title="Remove this delivery day?" description="New orders and unpaid receipt submissions will be blocked. Paid and review orders remain for your follow-up. You can reopen this day later." confirm-label="Remove day" cancel-label="Keep day" :busy="busy" :error="error" @confirm="save(true)" @update:open="confirmRemove = $event" />
  </section>
</template>
