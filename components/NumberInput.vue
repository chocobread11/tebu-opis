<script setup lang="ts">
import { NumberField, NumberFieldContent, NumberFieldDecrement, NumberFieldInput, NumberFieldIncrement } from '~/components/ui/number-field'
defineOptions({ inheritAttrs: false })
const props = withDefaults(defineProps<{ id: string; label: string; min?: number; max?: number; step?: number; required?: boolean; disabled?: boolean; placeholder?: string; decimals?: number }>(), { step: 1, decimals: 0 })
const model = defineModel<number | undefined>()
const format = computed(() => ({ useGrouping: false, minimumFractionDigits: props.decimals, maximumFractionDigits: props.decimals }))
function update(value: number | null | undefined) { model.value = typeof value !== 'number' || !Number.isFinite(value) ? undefined : value }
</script>
<template>
  <NumberField :id="id" :model-value="model" :min="min" :max="max" :step="step" :required="required" :disabled="disabled" :format-options="format" locale="en-MY" disable-wheel-change @update:model-value="update">
    <NumberFieldContent>
      <NumberFieldDecrement :aria-label="`Decrease ${label}`" />
      <NumberFieldInput v-bind="$attrs" :placeholder="placeholder" :required="required" />
      <NumberFieldIncrement :aria-label="`Increase ${label}`" />
    </NumberFieldContent>
  </NumberField>
</template>
