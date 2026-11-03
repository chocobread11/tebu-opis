<script setup lang="ts">
import { storefrontImages } from '~/lib/storefront-images'
const props = defineProps<{ jug?: boolean }>()
const failed = ref(false)
watch(() => props.jug, () => { failed.value = false })
</script>
<template>
  <BottleArt v-if="failed" :jug="jug" />
  <img v-else class="product-photo" :src="jug ? storefrontImages.jug : storefrontImages.flask" :alt="jug ? '1 litre Tebu Drop sharing jug' : '500 ml Tebu Drop sugarcane flask'" width="640" height="800" loading="lazy" @error="failed = true" />
</template>
