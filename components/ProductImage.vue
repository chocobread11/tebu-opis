<script setup lang="ts">
import type { Product } from '~/shared/domain'
import { ShoppingBag } from '~/lib/icons'
import { storefrontImages } from '~/lib/storefront-images'
const props = defineProps<{ besar?: boolean; product?: Product; eager?: boolean }>()
const image = computed(() => props.product?.imageUrl || (props.product ? (storefrontImages as Record<string, string>)[props.product.id] : props.besar ? storefrontImages.besar : storefrontImages.kecik) || '')
</script>
<template>
  <div v-if="!image" class="product-image-placeholder" role="img" :aria-label="props.product?.name || 'Product image'"><ShoppingBag aria-hidden="true" :size="48" /></div>
  <ImageReveal v-else class="product-photo" :src="image" :alt="product?.name || (besar ? 'Botol Besar · 1l sugarcane juice' : 'Botol Kecik · 500ml sugarcane juice')" :width="640" :height="800" :loading="eager ? 'eager' : 'lazy'"><template #error><BottleArt :besar="besar" /></template></ImageReveal>
</template>
