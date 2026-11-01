<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { cn } from '~/lib/utils'
const props = defineProps<{ class?: HTMLAttributes['class'] }>()
</script>
<template><div data-slot="number-field-content" :class="cn('relative min-w-0', props.class)"><slot /></div></template>
