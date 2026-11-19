<script setup lang="ts">
import { ArrowUpRight, Snowflake, Leaf, MapPin, ChevronRight, X } from '~/lib/icons'
import { money, ticketStatusLabel } from '~/shared/domain'
import { storefrontImages } from '~/lib/storefront-images'
const shop = useShop()
const testingCalendar = String(useRuntimeConfig().public.testingCalendar) === 'true'
const pickupInfo = ref(false)
const loading = ref(false)
const error = ref('')
async function refreshCatalog() {
  loading.value = true; error.value = ''
  try { await shop.refreshDrops() }
  catch { error.value = 'Could not refresh dates and bottle availability. Please try again.' }
  finally { loading.value = false }
}
watch(() => [shop.selected.value, ...shop.products.map(product => shop.available(product.id))], () => {
  for (const product of shop.products) shop.cart.value[product.id] = Math.min(shop.cart.value[product.id] || 0, shop.available(product.id))
})
let poll: ReturnType<typeof setInterval> | undefined
function onFocus() { if (!document.hidden && !loading.value) refreshCatalog() }
const { data: initialCatalog } = await useAsyncData('storefront-initial-catalog', async () => {
  if (shop.demo) return false
  try { await shop.refreshDrops(); return true } catch { return false }
})
useHead({ link: [{ rel: 'preload', as: 'image', href: storefrontImages.hero, fetchpriority: 'high' }] })
onMounted(async () => {
  if (!initialCatalog.value) await refreshCatalog()
  if (!shop.demo) {
    try { await shop.refreshTickets(true) } catch (e: any) { if (e.status !== 401 && e.statusCode !== 401) shop.notify('Could not refresh your past orders.') }
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
      <div class="hero-scene"><ImageReveal class="hero-photo" :src="storefrontImages.hero" alt="Fresh sugarcane juice in Botol Kecik and Botol Besar" fetchpriority="high" loading="eager" :width="1536" :height="1024" /></div>
      <div class="hero-bottom"><span>FROM OUR BACKYARD TO YOUR PANTRY</span><span>↗</span></div>
    </section>
    <button class="pickup-strip" :aria-expanded="pickupInfo" aria-controls="pickup-instructions" @click="pickupInfo = !pickupInfo"><span class="pickup-icon"><MapPin aria-hidden="true" :size="18" /></span><span><strong>Your office. Your pickup spot.</strong><small>Level 7 pantry freezer · From 9:00 AM</small></span><ChevronRight aria-hidden="true" :size="17" /></button>
    <Transition name="expand"><section v-show="pickupInfo" id="pickup-instructions" class="info-card"><div class="section-heading"><h3>From cane to coffee break.</h3><button class="icon-button" @click="pickupInfo = false" aria-label="Close pickup instructions"><X aria-hidden="true" :size="17" /></button></div><ol><li>Pick a drop day and choose your bottles.</li><li>Pay with DuitNow and upload your receipt.</li><li>After confirmation, find your named bag in the Level 7 pantry freezer from 9 AM.</li></ol><p>Keep frozen. Thaw in the fridge, shake well and enjoy cold. Collect on your chosen day.</p></section></Transition>
    <div class="store-layout"><aside class="store-sidebar" aria-label="Choose your drop">
    <section id="section-week" class="schedule-section"><div class="section-heading"><h2>Pick your drop.</h2><span class="small-pill">{{ testingCalendar ? 'NEXT 5 DAYS' : 'THIS WEEK ONLY' }}</span></div><p v-if="error" class="error" role="alert">{{ error }}</p><WeekCalendar v-model="shop.selected.value" :week="shop.week.value" :days="shop.days.value" :loading="loading"><BottleBox :day="shop.days.value.find(day => day.id === shop.selected.value)" :availability="shop.products.filter(p=>p.kind==='bottle').map(p=>({id:p.id,name:p.name,max:shop.available(p.id)}))" :max-kecik="shop.available('kecik')" :max-besar="shop.available('besar')" /></WeekCalendar></section>

    </aside><div class="store-products">
    <section class="menu-section"><div class="section-heading"><h2>Fresh picks.</h2><span class="small-pill">NO ICE. NO DILUTION.</span></div><div class="product-grid"><article v-for="(product, index) in shop.products.filter(p => p.kind === 'bottle')" :key="product.id" :class="['product-card', { 'is-sold-out': shop.soldOut(product.id) }]" :data-product-id="product.id"><div :class="['product-image', { 'besar-image': product.id === 'besar' || product.id === 'tebu-2-besar' }]"><ProductImage :product="product" :eager="index < 2" :besar="product.id === 'besar' || product.id === 'tebu-2-besar'"/><span class="volume-label">{{ product.size }}</span></div><div class="product-details"><h3>{{ product.name }}</h3><p>{{ product.description }}</p><p class="bottle-availability">{{ shop.soldOut(product.id) ? 'Sold out' : shop.available(product.id) > 0 ? `${shop.available(product.id)} available` : 'Unavailable for this drop' }}</p><div class="product-footer"><strong>{{ money(product.price) }}</strong><QuantityControl :quantity="shop.cart.value[product.id] || 0" :label="product.name" :max="shop.available(product.id)" :disabled="shop.soldOut(product.id)" bottle @change="shop.change(product.id, $event)" /></div></div></article></div></section>
    <section class="addons"><div class="section-heading"><h2>+ Add ons</h2><span class="subtle">flavour enhancer</span></div><div class="addon-grid"><article v-for="p in shop.products.filter(p => p.kind === 'addon')" :key="p.id" :class="['addon-card', { 'is-sold-out': shop.soldOut(p.id) }]" :data-product-id="p.id"><ImageReveal class="addon-photo" :src="p.imageUrl || (p.id === 'asam' ? storefrontImages.asam : p.id === 'limau' ? storefrontImages.limau : '')" v-if="p.imageUrl || ['asam','limau'].includes(p.id)" :alt="p.name" :width="480" :height="480" loading="lazy" /><div v-else class="addon-photo addon-photo-placeholder" aria-hidden="true">{{p.name.slice(0,1)}}</div><div class="addon-title"><h3>{{ p.name }}</h3><span>+{{ money(p.price) }}</span></div><p>{{ p.description }}</p><div class="addon-bottom"><span>{{ shop.soldOut(p.id) ? 'Sold out' : p.size }}</span><QuantityControl :quantity="shop.cart.value[p.id] || 0" :label="p.name" :max="shop.available(p.id)" :disabled="shop.soldOut(p.id)" compact @change="shop.change(p.id, $event)" /></div></article></div></section>
    </div></div>
  </div>
</template>
