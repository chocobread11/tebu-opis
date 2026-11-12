<script setup lang="ts">
import { bottleSpaces, type CalendarDay } from '~/shared/domain'
const props = defineProps<{ day?: CalendarDay; maxKecik: number; maxBesar: number }>()
const kecikBottles = computed(() => props.day?.kecikUsed ?? 0)
const besarBottles = computed(() => props.day?.besarUsed ?? 0)
const usedSpaces = computed(() => bottleSpaces({ kecik: kecikBottles.value, besar: besarBottles.value }))
const remaining = computed(() => props.day?.remaining ?? 0)
const date = computed(() => props.day ? new Date(`${props.day.id}T00:00:00Z`).toLocaleDateString('en-MY', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }) : '')
</script>
<template>
  <div v-if="day" class="daily-box">
    <div class="bottle-box-summary">
      <div class="bottle-box" role="img" :aria-label="`${date}: ${kecikBottles} Botol Kecik and ${besarBottles} Botol Besar reserved across all orders. ${remaining} of ${day.capacity} bottle spaces left.`">
        <div class="bottle-box-interior" aria-hidden="true">
          <span v-for="n in kecikBottles" :key="`kecik-${n}`" class="box-bottle box-bottle-kecik"><i /></span>
          <span v-for="n in besarBottles" :key="`besar-${n}`" class="box-bottle box-bottle-besar"><i /></span>
          <span v-for="n in remaining" :key="`free-${n}`" class="box-bottle box-bottle-vacant" />
        </div>
      </div>
      <div class="bottle-box-counts" aria-live="polite" aria-atomic="true">
        <span class="eyebrow">DAY’S BOX · TOP VIEW</span>
        <span class="bottle-box-date">{{ date }}</span>
        <strong>{{ usedSpaces }}<small> / {{ day.capacity }} spaces used</small></strong>
        <span><i class="box-count-dot" />{{ kecikBottles }} × Kecik · 1 space each</span>
        <span><i class="box-count-dot besar" />{{ besarBottles }} × Besar · 2 spaces each</span>
        <small>{{ remaining }} {{ remaining === 1 ? 'space' : 'spaces' }} left</small>
      </div>
    </div>
    <div class="bottle-box-availability" aria-live="polite" aria-atomic="true">
      <strong>You can order up to</strong><span>{{ maxKecik }} Kecik or {{ maxBesar }} Besar</span>
      <small>Mix both sizes to fit the box: Kecik uses 1 space, Besar uses 2. Counts include your cart and selected tebu’s stock. Filled spaces are reserved by all customers. Unpaid reservations expire after 20 minutes.</small>
    </div>
  </div>
  <p v-else class="helper">Choose a delivery date to see its box and available quantities.</p>
</template>
