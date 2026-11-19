<script setup lang="ts">
import { ShoppingBag } from '~/lib/icons'
const props = withDefaults(defineProps<{ src: string; alt: string; width: number; height: number; loading?: 'eager' | 'lazy'; fetchpriority?: 'high' | 'low' | 'auto' }>(), { loading: 'lazy', fetchpriority: 'auto' })
const photo = ref<HTMLImageElement | null>(null)
const loaded = ref(false), failed = ref(false), animated = ref(false)
watch(() => props.src, () => { loaded.value = false; failed.value = false; animated.value = true })
async function reveal(element: HTMLImageElement) {
  const source = props.src
  try { await element.decode() } catch { /* The load event can still provide a usable image. */ }
  if (source === props.src && element === photo.value && element.naturalWidth > 0) loaded.value = true
}
onMounted(() => {
  // Images can finish loading or fail before hydration attaches the event handlers.
  if (!photo.value) return
  if (!photo.value.complete) { animated.value = true; return }
  if (photo.value.naturalWidth) reveal(photo.value)
  else failed.value = true
})
</script>
<template>
  <span class="image-reveal" :data-animated="animated" :data-state="failed || !src ? 'failed' : loaded ? 'loaded' : 'loading'" :aria-busy="!!src && !loaded && !failed">
    <span class="image-reveal-placeholder" aria-hidden="true" />
    <span v-if="failed || !src" class="image-reveal-fallback" role="img" :aria-label="alt"><slot name="error"><ShoppingBag aria-hidden="true" :size="32" /></slot></span>
    <img v-else ref="photo" class="image-reveal-photo" :key="src" :src="src" :alt="alt" :width="width" :height="height" :loading="loading" :fetchpriority="fetchpriority" decoding="async" @load="reveal($event.currentTarget as HTMLImageElement)" @error="failed = true" />
  </span>
</template>
