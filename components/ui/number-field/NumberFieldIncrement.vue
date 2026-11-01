<script setup lang="ts">
import type { NumberFieldIncrementProps } from 'reka-ui'
import type { HTMLAttributes } from 'vue'
import { NumberFieldIncrement, useForwardProps } from 'reka-ui'
import { Plus } from 'lucide-vue-next'
import { cn } from '~/lib/utils'
const props = defineProps<NumberFieldIncrementProps & { class?: HTMLAttributes['class'] }>()
const delegated = computed(() => { const { class: _, ...rest } = props; return rest })
const forwarded = useForwardProps(delegated)
</script>
<template><NumberFieldIncrement v-bind="forwarded" data-slot="increment" :class="cn('number-field-stepper absolute inset-y-0 right-0 flex w-9 items-center justify-center rounded-r-md text-muted-foreground transition-colors hover:text-foreground focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-30', props.class)"><slot><Plus class="h-4 w-4" aria-hidden="true" /></slot></NumberFieldIncrement></template>
