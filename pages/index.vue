<script setup lang="ts">
import { ArrowUpRight, Snowflake, Leaf, MapPin, ChevronRight, X } from '~/lib/icons'
import { money, ticketStatusLabel } from '~/shared/domain'
import { storefrontImages } from '~/lib/storefront-images'
const shop = useShop()
const pickupInfo = ref(false)
const loading = ref(false)
const error = ref('')
async function refreshCatalog() {
  loading.value = true; error.value = ''
  try { await shop.refreshDrops() }
  catch { error.value = 'Could not refresh dates and bottle availability. Please try again.' }
  finally { loading.value = false }
}
watch([shop.varietyId, shop.selected, () => shop.available('flask'), () => shop.available('jug')], () => {
  shop.cart.value.flask = Math.min(shop.cart.value.flask, shop.available('flask'))
  shop.cart.value.jug = Math.min(shop.cart.value.jug, shop.available('jug'))
})
let poll: ReturnType<typeof setInterval> | undefined
function onFocus() { if (!document.hidden && !loading.value) refreshCatalog() }
onMounted(async () => {
  await refreshCatalog()
  if (!shop.demo) {
    try { await shop.refreshTickets() } catch { shop.notify('Could not refresh your past orders.') }
  }
  poll = setInterval(onFocus, 15000)
  document.addEventListener('visibilitychange', onFocus)
})
onBeforeUnmount(() => { clearInterval(poll); document.removeEventListener('visibilitychange', onFocus) })
</script>
<template>
  <div class="home-page" :aria-busy="loading">
    <NuxtLink v-if="shop.activeTicket.value" class="active-ticket" :to="`/drop?t=${shop.activeTicket.value.token}`">
      <span class="active-ticket-badge">{{ shop.activeTicket.value.status === 'ready' ? 'READY TO COLLECT' : 'ACTIVE ORDER' }}</span>
      <div><strong>{{ shop.activeTicket.value.tag }} · {{ ticketStatusLabel(shop.activeTicket.value) }}</strong><span>View your order and pickup details</span></div><ChevronRight aria-hidden="true" :size="18" />
    </NuxtLink>
    <div class="intro-row"><span class="eyebrow"><span class="status-dot"></span> YOUR WEEKDAY REFRESH</span><button class="text-button" :aria-expanded="pickupInfo" aria-controls="pickup-instructions" @click="pickupInfo = !pickupInfo">How it works <ArrowUpRight aria-hidden="true" :size="13" /></button></div>
    <section class="hero">
      <div class="hero-copy"><span class="hero-kicker">PRESSED FRESH. FROZEN SOLID.</span><h1>A little cane.<br>A better<br> <span>workday.</span></h1><p>Pure backyard sugarcane.<br>Cold-pressed. Nothing added.</p><div class="hero-tags"><span><Leaf aria-hidden="true" :size="11"/> 100% pure</span><span><Snowflake aria-hidden="true" :size="11"/> Always cold</span></div></div>
      <div class="hero-scene"><img class="hero-photo" :src="storefrontImages.hero" alt="Fresh sugarcane juice in a flask and sharing jug" fetchpriority="high" width="1536" height="1024" /></div>
      <div class="hero-bottom"><span>FROM OUR BACKYARD TO YOUR PANTRY</span><span>↗</span></div>
    </section>
    <button class="pickup-strip" :aria-expanded="pickupInfo" aria-controls="pickup-instructions" @click="pickupInfo = !pickupInfo"><span class="pickup-icon"><MapPin aria-hidden="true" :size="18" /></span><span><strong>Your office. Your pickup spot.</strong><small>Level 7 pantry freezer · From 9:00 AM</small></span><ChevronRight aria-hidden="true" :size="17" /></button>
    <Transition name="expand"><section v-show="pickupInfo" id="pickup-instructions" class="info-card"><div class="section-heading"><h3>From cane to coffee break.</h3><button class="icon-button" @click="pickupInfo = false" aria-label="Close pickup instructions"><X aria-hidden="true" :size="17" /></button></div><ol><li>Pick a drop day and choose your bottles.</li><li>Pay with DuitNow and upload your receipt.</li><li>After confirmation, find your numbered bag in the Level 7 pantry freezer from 9 AM.</li></ol><p>Keep frozen. Thaw in the fridge, shake well and enjoy cold. Collect on your chosen day.</p></section></Transition>
    <div class="store-layout"><aside class="store-sidebar" aria-label="Choose your drop and sugarcane">
    <section class="schedule-section"><div class="section-heading"><h2>Pick your drop.</h2><span class="small-pill">THIS WEEK ONLY</span></div><p v-if="error" class="error" role="alert">{{ error }}</p><WeekCalendar v-model="shop.selected.value" :week="shop.week.value" :days="shop.days.value" :loading="loading" /></section>
    <section class="variety-section"><div class="section-heading"><h2>Pick your tebu.</h2><span class="subtle">Fresh from our garden</span></div><div class="variety-picker" role="group" aria-label="Sugarcane variety"><button v-for="variety in shop.varieties.value" :key="variety.id" type="button" :class="['variety-option', { selected: shop.varietyId.value === variety.id }]" :aria-pressed="shop.varietyId.value === variety.id" @click="shop.varietyId.value = variety.id"><strong>{{ variety.name }}</strong><span v-if="variety.description">{{ variety.description }}</span></button></div><p v-if="!loading && !shop.varieties.value.some(v => v.flaskRemaining + v.jugRemaining > 0)" class="helper">Fresh bottles are on the way. Check back after our next harvest.</p></section>
    </aside><div class="store-products">
    <section class="menu-section"><div class="section-heading"><h2>Goodness, bottled.</h2><span class="small-pill">NO ICE. NO DILUTION.</span></div><div class="product-grid"><article v-for="product in shop.products.filter(p => p.kind === 'bottle')" :key="product.id" class="product-card"><div :class="['product-image', { 'jug-image': product.id === 'jug' }]"><ProductImage :jug="product.id === 'jug'"/><span class="volume-label">{{ product.size }}</span></div><div class="product-details"><span v-if="product.id === 'flask'" class="product-kicker">THE DAILY FAVOURITE</span><span v-else class="product-kicker">BETTER TOGETHER</span><h3>{{ product.name }}</h3><p>{{ product.description }}</p><p class="bottle-availability">{{ shop.variety.value?.name || 'Choose a tebu variety' }} · {{ shop.available(product.id) }} bottles left</p><div class="product-footer"><strong>{{ money(product.price) }}</strong><QuantityControl :quantity="shop.cart.value[product.id]" :label="product.name" :max="shop.available(product.id)" bottle @change="shop.change(product.id, $event)" /></div></div></article></div></section>
    <section class="addons"><div class="section-heading"><h2>Make it your own.</h2><span class="subtle">A little extra zing</span></div><div class="addon-grid"><article v-for="p in shop.products.filter(p => p.kind === 'addon')" :key="p.id" class="addon-card"><img class="addon-photo" :src="p.id === 'asam' ? storefrontImages.asam : storefrontImages.limau" :alt="`${p.name} in a small clear ziplock pouch`" width="480" height="480" loading="lazy" /><div class="addon-title"><h3>{{ p.name }}</h3><span>+{{ money(p.price) }}</span></div><p>{{ p.description }}</p><div class="addon-bottom"><span>DIY ADD-ON POUCH</span><QuantityControl :quantity="shop.cart.value[p.id]" :label="p.name" compact @change="shop.change(p.id, $event)" /></div></article></div></section>
    </div></div>
  </div>
</template>
