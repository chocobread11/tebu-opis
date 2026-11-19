<script setup lang="ts">
defineProps<{ src: string }>()
</script>
<template>
  <img :src="src" alt="Payment QR" class="payment-qr payment-qr-code" />
</template>
