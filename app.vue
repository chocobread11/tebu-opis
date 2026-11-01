<script setup lang="ts">
import { Leaf, ShoppingBag, History, ClipboardCheck, BookOpen, CalendarDays, ArrowUpRight, ArrowLeft } from 'lucide-vue-next'
const route = useRoute()
const shop = useShop()
const scrollArea = ref<HTMLElement | null>(null)
const isAdmin = computed(() => route.path.startsWith('/admin'))
const isCalendar = computed(() => route.path === '/admin/calendar')
const adminNavIndex = computed(() => isCalendar.value ? 1 : isLog.value ? 2 : 0)
const isLog = computed(() => route.path === '/admin/log')
const adminPreview = computed(() => shop.demo)
const cartOverlay = computed(() => route.path === '/' && Object.values(shop.cart.value).some(quantity => quantity > 0))
const secondNavItem = computed(() => route.path === '/drop' || route.path === '/admin/log')
onMounted(() => shop.load())
watch(() => route.fullPath, async () => {
  await nextTick()
  scrollArea.value?.scrollTo({ top: 0, behavior: 'instant' })
})
</script>
<template>
  <div class="desktop-note"><span class="desktop-wordmark">tebu<span>drop.</span></span><p>A fresh little ritual<br>for your workday.</p><span class="note-rule"></span><small>COLD-PRESSED. PANTRY-READY.</small></div>
  <div :class="['app-shell', { 'demo-mode': shop.demo, 'admin-shell': isAdmin }]">
    <header v-if="isAdmin" class="app-header admin-header">
      <NuxtLink to="/" class="admin-back" aria-label="Storefront"><ArrowLeft aria-hidden="true" :size="16" /></NuxtLink>
      <div class="admin-header-title"><span class="eyebrow">{{ isLog ? 'FINANCIAL LOG' : isCalendar ? 'CALENDAR & ORDERS' : 'OPS CONSOLE' }}</span><h1>{{ isLog ? 'A little bookkeeping.' : isCalendar ? 'Plan your drops.' : 'Your drop checklist.' }}</h1></div>
      <span class="admin-live"><span class="status-dot" />{{ adminPreview ? 'Preview' : 'Live' }}</span>
    </header>
    <header v-else class="app-header" :inert="cartOverlay" :aria-hidden="cartOverlay"><NuxtLink to="/" class="wordmark" aria-label="Tebu Drop home"><span class="brand-mark"><Leaf aria-hidden="true" :size="21" :stroke-width="2.3" /></span>tebu<span>drop.</span></NuxtLink><NuxtLink to="/admin" class="area-switch">Admin <ArrowUpRight aria-hidden="true" :size="12" /></NuxtLink></header>
    <OrderBar v-if="route.path === '/'" />
    <main ref="scrollArea" class="app-content"><NuxtPage :transition="{ name: 'page', mode: 'out-in' }" /></main>
    <nav v-if="isAdmin" class="bottom-nav admin-bottom-nav" :style="{ '--admin-nav-index': adminNavIndex }" aria-label="Admin navigation">
      <span class="nav-indicator" aria-hidden="true" />
      <NuxtLink to="/admin" :class="{ active: route.path === '/admin' }"><ClipboardCheck aria-hidden="true" :size="18" />Checklist</NuxtLink>
      <NuxtLink to="/admin/calendar" :class="{ active: isCalendar }"><CalendarDays aria-hidden="true" :size="18" />Calendar</NuxtLink>
      <NuxtLink to="/admin/log" :class="{ active: route.path === '/admin/log' }"><BookOpen aria-hidden="true" :size="18" />Log</NuxtLink>
    </nav>
    <nav v-else :class="['bottom-nav', { 'nav-second': secondNavItem }]" aria-label="Public navigation">
      <span class="nav-indicator" aria-hidden="true" />
      <NuxtLink to="/" :class="{ active: route.path === '/' }"><ShoppingBag aria-hidden="true" :size="18" />The drop</NuxtLink>
      <NuxtLink to="/drop" :class="{ active: route.path === '/drop' }"><History aria-hidden="true" :size="18" />Past transactions</NuxtLink>
    </nav>
    <Transition name="toast"><div v-if="shop.toast.value" class="toast" role="status">{{ shop.toast.value }}</div></Transition>
    <CheckoutDrawer />
  </div>
  <div class="desktop-footer">FROM THE CANE. TO YOUR OFFICE. <span>↙</span></div>
</template>
