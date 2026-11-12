<script setup lang="ts">
import { storefrontImages } from '~/lib/storefront-images'
const props = defineProps<{ besar?: boolean }>()
const failed = ref(false)
watch(() => props.besar, () => { failed.value = false })
</script>
<template>
  <BottleArt v-if="failed" :besar="besar" />
  <img v-else class="product-photo" :src="besar ? storefrontImages.besar : storefrontImages.kecik" :alt="besar ? 'Botol Besar · 1l sugarcane juice' : 'Botol Kecik · 500ml sugarcane juice'" width="640" height="800" loading="lazy" @error="failed = true" />
</template>
