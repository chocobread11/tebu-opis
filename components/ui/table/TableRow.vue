<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { cn } from '~/lib/utils'
defineProps<{ class?: HTMLAttributes['class'] }>()
</script>
<template><tr :class="cn('border-b transition-colors hover:bg-black/[0.025] data-[state=selected]:bg-black/5', $props.class)"><slot /></tr></template>
