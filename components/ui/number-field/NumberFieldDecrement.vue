<script setup lang="ts">
import type { NumberFieldDecrementProps } from 'reka-ui'
import type { HTMLAttributes } from 'vue'
import { NumberFieldDecrement, useForwardProps } from 'reka-ui'
import { Minus } from 'lucide-vue-next'
import { cn } from '~/lib/utils'
const props = defineProps<NumberFieldDecrementProps & { class?: HTMLAttributes['class'] }>()
const delegated = computed(() => { const { class: _, ...rest } = props; return rest })
const forwarded = useForwardProps(delegated)
</script>
<template><NumberFieldDecrement v-bind="forwarded" data-slot="decrement" :class="cn('number-field-stepper absolute inset-y-0 left-0 flex w-9 items-center justify-center rounded-l-md text-muted-foreground transition-colors hover:text-foreground focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-30', props.class)"><slot><Minus class="h-4 w-4" aria-hidden="true" /></slot></NumberFieldDecrement></template>
