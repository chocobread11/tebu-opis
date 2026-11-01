<script setup lang="ts">
import type { NumberFieldRootProps, NumberFieldRootEmits } from 'reka-ui'
import type { HTMLAttributes } from 'vue'
import { NumberFieldRoot, useForwardPropsEmits } from 'reka-ui'
import { cn } from '~/lib/utils'
const props = defineProps<NumberFieldRootProps & { class?: HTMLAttributes['class'] }>()
const emit = defineEmits<NumberFieldRootEmits>()
const delegated = computed(() => { const { class: _, ...rest } = props; return rest })
const forwarded = useForwardPropsEmits(delegated, emit)
</script>
<template><NumberFieldRoot v-slot="slotProps" v-bind="forwarded" data-slot="number-field" :class="cn('grid min-w-0 gap-1.5', props.class)"><slot v-bind="slotProps" /></NumberFieldRoot></template>
