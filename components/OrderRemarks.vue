<script setup lang="ts">
defineProps<{ value?: string | null; compact?: boolean; preview?: boolean }>()
</script>
<template>
  <div v-if="value" :class="['order-remarks', { 'order-remarks-compact': compact, 'order-remarks-preview': preview }]"><strong>Remarks</strong><p>{{ value }}</p></div>
</template>
