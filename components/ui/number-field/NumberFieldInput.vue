<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { NumberFieldInput } from 'reka-ui'
import { cn } from '~/lib/utils'
const props = defineProps<{ class?: HTMLAttributes['class'] }>()
</script>
<template><NumberFieldInput data-slot="number-field-input" :class="cn('shadcn-control flex h-9 w-full min-w-0 rounded-md border border-input bg-background px-9 py-1 text-center text-sm tabular-nums shadow-sm outline-none transition-[color,box-shadow] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:border-destructive aria-[invalid=true]:ring-destructive/20', props.class)" /></template>
