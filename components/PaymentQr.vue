<script setup lang="ts">
defineProps<{ src: string }>()
</script>
<template>
  <!-- Display the QR region of the supplied MAE screenshot without altering its pixels or payload. -->
  <svg v-if="src === '/qr/duitnow.jpeg'" class="payment-qr payment-qr-code" viewBox="270 275 385 385" role="img" aria-label="MAE DuitNow payment QR">
    <image :href="src" width="923" height="1280" />
  </svg>
  <img v-else :src="src" alt="DuitNow payment QR" class="payment-qr payment-qr-code" />
</template>
