<script setup lang="ts">
import { ChevronLeft, ChevronRight } from 'lucide-vue-next'
import { malaysiaToday, monthDays, type CalendarDay } from '~/shared/domain'
const props = defineProps<{ modelValue: string; month: string; days: CalendarDay[]; admin?: boolean; loading?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: string]; 'update:month': [value: string] }>()
const today = malaysiaToday()
const cells = computed(() => monthDays(props.month))
const records = computed(() => new Map(props.days.map(day => [day.id, day])))
const caption = computed(() => new Date(`${props.month}-01T00:00:00Z`).toLocaleDateString('en-MY', { month: 'long', year: 'numeric', timeZone: 'UTC' }))
function move(delta: number) {
  const date = new Date(`${props.month}-01T00:00:00Z`)
  date.setUTCMonth(date.getUTCMonth() + delta)
  emit('update:month', date.toISOString().slice(0, 7))
}
function available(id: string) {
  const day = records.value.get(id)
  return !!day?.open && !day.removedAt && !day.droppedAt && day.remaining > 0 && id > today
}
function status(id: string) {
  const day = records.value.get(id)
  if (props.admin) return day?.removedAt ? 'Removed' : day?.droppedAt ? 'Delivered' : day?.open ? 'Open' : day?.closedReason || 'Closed'
  if (id <= today) return 'Past'
  if (!day?.open) return 'Closed'
  return day.remaining ? `${day.remaining} left` : 'Full'
}
function label(id: string) {
  const date = new Date(`${id}T00:00:00Z`).toLocaleDateString('en-MY', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
  return `${date} · ${status(id)}`
}
</script>
<template>
  <section class="month-calendar" :aria-busy="loading" aria-label="Delivery calendar">
    <div class="calendar-heading"><button type="button" class="icon-button" aria-label="Previous month" :disabled="loading" @click="move(-1)"><ChevronLeft aria-hidden="true" :size="18" /></button><strong aria-live="polite">{{ caption }}</strong><button type="button" class="icon-button" aria-label="Next month" :disabled="loading" @click="move(1)"><ChevronRight aria-hidden="true" :size="18" /></button></div>
    <div class="calendar-weekdays" aria-hidden="true"><span v-for="day in ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']" :key="day">{{ day }}</span></div>
    <div class="calendar-grid" role="group" aria-label="Delivery dates">
      <template v-for="(id, i) in cells" :key="id || `blank-${i}`">
        <button v-if="id" type="button" :class="['calendar-date', { selected: modelValue === id, available: available(id), 'calendar-closed': !available(id), 'calendar-today': id === today }]" :disabled="loading || (!admin && !available(id))" :aria-label="label(id)" :aria-pressed="modelValue === id" :aria-current="id === today ? 'date' : undefined" :data-date="id" @click="emit('update:modelValue', id)"><b>{{ Number(id.slice(-2)) }}</b><small>{{ status(id) }}</small></button>
        <span v-else class="calendar-blank" aria-hidden="true" />
      </template>
    </div>
    <p class="calendar-legend"><span class="status-dot" />{{ admin ? 'Select a date to manage availability.' : 'Select an open date. Closed dates cannot accept orders.' }}</p>
  </section>
</template>
