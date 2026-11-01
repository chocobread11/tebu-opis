<script setup lang="ts">
import { CalendarDays, RefreshCw } from 'lucide-vue-next'
import { malaysiaToday, publicDeliveryDays, type ActiveWeek, type CalendarDay } from '~/shared/domain'
const props = defineProps<{ modelValue: string; week: ActiveWeek; days: CalendarDay[]; loading?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [id: string] }>()
const visibleDays = computed(() => publicDeliveryDays(props.days, props.week))
const records = computed(() => new Map(props.days.map(day => [day.id, day])))
function available(id: string) { const day = records.value.get(id); return !!day?.open && !day.removedAt && !day.droppedAt && day.remaining > 0 && id > malaysiaToday() }
function status(id: string) {
  if (id <= malaysiaToday()) return 'Past'
  const day = records.value.get(id)
  if (!day?.open || day.removedAt || day.droppedAt) return 'Closed'
  return day.remaining > 0 ? 'Open' : 'Full'
}
function label(id: string) { return `${new Date(`${id}T00:00:00Z`).toLocaleDateString('en-MY', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })} · ${status(id)}` }
</script>
<template>
  <section class="week-calendar" aria-label="Active week delivery calendar" :aria-busy="loading">
    <div class="week-heading"><CalendarDays :size="18" aria-hidden="true" /><strong>{{ week.label }}</strong><span v-if="loading" class="week-loading" role="status">Updating</span></div>
    <div class="week-grid" :style="{ gridTemplateColumns: `repeat(${Math.max(1, visibleDays.length)}, minmax(0, 1fr))` }" role="group" aria-label="Delivery dates">
      <button v-for="{ id } in visibleDays" :key="id" type="button" :class="['week-date', { selected: modelValue === id, available: available(id) }]" :data-date="id" :aria-label="label(id)" :aria-pressed="modelValue === id" :disabled="loading || !available(id)" @click="emit('update:modelValue', id)"><span>{{ new Date(`${id}T00:00:00Z`).toLocaleDateString('en', { weekday: 'short', timeZone: 'UTC' }) }}</span><b>{{ Number(id.slice(-2)) }}</b><small>{{ status(id) }}</small></button>
    </div>
    <p class="week-note"><RefreshCw :size="14" aria-hidden="true" />A fresh ordering week opens every Sunday after restock.</p>
    <p v-if="!loading && !visibleDays.some(day => available(day.id))" class="week-empty" role="status">No delivery dates left this week. Check back after Sunday’s restock.</p>
  </section>
</template>
