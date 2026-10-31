<script setup lang="ts">
import { Leaf, ShoppingBag, Ticket, Settings2 } from 'lucide-vue-next'
const route = useRoute()
const shop = useShop()
onMounted(() => shop.load())
</script>
<template>
  <div class="desktop-note"><span class="desktop-wordmark">tebu<span>drop.</span></span><p>A fresh little ritual<br>for your workday.</p><span class="note-rule"></span><small>COLD-PRESSED. PANTRY-READY.</small></div>
  <div :class="['app-shell', { 'demo-mode': shop.demo }]">
    <header class="app-header"><NuxtLink to="/" class="wordmark" aria-label="Tebu Drop home"><span class="brand-mark"><Leaf :size="21" :stroke-width="2.3" /></span>tebu<span>drop.</span></NuxtLink><span class="location-pill"><span class="status-dot"></span> LEVEL 7 PANTRY</span></header>
    <main><NuxtPage /></main>
    <nav class="bottom-nav" aria-label="Main navigation"><NuxtLink to="/" :class="{ active: route.path === '/' }"><ShoppingBag :size="19" />The drop</NuxtLink><NuxtLink to="/drop" :class="{ active: route.path === '/drop' }"><Ticket :size="19" />My bottle</NuxtLink><NuxtLink to="/admin" :class="{ active: route.path.startsWith('/admin') }"><Settings2 :size="19" />Pantry ops</NuxtLink></nav>
    <div v-if="shop.demo" class="demo-ribbon">DEMO · Orders stay on this device. No real payments.</div>
    <Transition name="toast"><div v-if="shop.toast.value" class="toast" role="status">{{ shop.toast.value }}</div></Transition>
    <CheckoutDrawer />
  </div>
  <div class="desktop-footer">FROM THE CANE. TO YOUR OFFICE. <span>↙</span></div>
</template>
