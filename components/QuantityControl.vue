<script setup lang="ts">
import { NumberField, NumberFieldContent, NumberFieldDecrement, NumberFieldInput, NumberFieldIncrement } from '~/components/ui/number-field'
const props = defineProps<{ quantity: number; label: string; bottle?: boolean; compact?: boolean; max?: number; disabled?: boolean }>()
const emit = defineEmits<{ change: [delta: number] }>()
const addLabel = computed(() => props.quantity > 0 && props.bottle ? `Add one ${props.label}` : `Add ${props.label}`)
const removeLabel = computed(() => props.bottle ? `Remove one ${props.label}` : `Remove ${props.label}`)
function update(value: number | null | undefined) {
  const next = typeof value !== 'number' || !Number.isFinite(value) ? 0 : value
  emit('change', next - props.quantity)
}
</script>
<template>
  <NumberField :class="['quantity-control', { 'has-quantity': quantity > 0, 'quantity-compact': compact }]" :aria-label="`${label} quantity`" :disabled="disabled || max === 0" :model-value="quantity" :min="0" :max="max ?? 10" :step="1" :format-options="{ useGrouping: false }" locale="en-MY" disable-wheel-change @update:model-value="update">
    <NumberFieldContent>
      <NumberFieldDecrement class="quantity-decrease" :aria-label="removeLabel" />
      <NumberFieldInput class="quantity-value" :aria-label="`${label} quantity`" inputmode="none" autocomplete="off" />
      <NumberFieldIncrement class="quantity-increase" :aria-label="addLabel" />
    </NumberFieldContent>
  </NumberField>
</template>
