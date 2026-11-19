<script setup lang="ts">
import { Leaf, ShoppingBag, History, ClipboardCheck, BookOpen, CalendarDays, ArrowUpRight, ArrowLeft, Settings } from '~/lib/icons'
const route = useRoute()
const isReceipt = computed(() => route.path === '/receipt' || route.path.startsWith('/receipt/'))
const shop = useShop()
const admin = useAdmin()
const signOutError = ref('')
async function signOut() { signOutError.value = ''; try { await admin.logout() } catch { signOutError.value = 'Could not sign out. Please try again.' } }
const scrollArea = ref<HTMLElement | null>(null)
const isAdmin = computed(() => route.path.startsWith('/admin'))
const isSettings = computed(() => route.path === '/admin/settings')
const isCalendar = computed(() => route.path === '/admin/calendar')
const adminNavIndex = computed(() => isSettings.value ? 3 : isCalendar.value ? 1 : isLog.value ? 2 : 0)
const isAudit=computed(()=>route.path==='/admin/history')
const isFinance = computed(() => route.path === '/admin/finance')
const isLog = computed(() => ['/admin/log','/admin/products','/admin/finance','/admin/history'].includes(route.path))
const adminPreview = computed(() => shop.demo)
const cartOverlay = computed(() => route.path === '/' && Object.values(shop.cart.value).some(quantity => quantity > 0))
const secondNavItem = computed(() => route.path === '/drop' || ['/admin/log','/admin/products','/admin/finance','/admin/history'].includes(route.path))
onMounted(() => { shop.load(); if (!shop.demo && !shop.settingsLoaded.value) shop.refreshSettings().catch(() => {}) })
watch(() => route.fullPath, async () => {
  if (!shop.demo && !isAdmin.value) shop.refreshSettings().catch(() => {})
  await nextTick()
  scrollArea.value?.scrollTo({ top: 0, behavior: 'instant' })
})
</script>
<template>
  <main v-if="isReceipt"><NuxtPage /></main>
  <div v-else :class="['app-shell', { 'demo-mode': shop.demo, 'admin-shell': isAdmin, 'admin-signed-in': admin.authenticated.value && !admin.local }]">
    <header v-if="isAdmin" class="app-header admin-header">
      <NuxtLink to="/" class="admin-back" aria-label="Storefront"><ArrowLeft aria-hidden="true" :size="16" /></NuxtLink>
      <div class="admin-header-title"><span class="eyebrow">{{ isSettings?'SETTINGS':isAudit?'CHANGE HISTORY':isFinance ? 'FINANCE' : isLog ? 'PRODUCTS & INVENTORY' : isCalendar ? 'CALENDAR & ORDERS' : 'OPS CONSOLE' }}</span><h1>{{ isSettings?'Shop settings.':isAudit?'Change history.':isFinance ? 'A little bookkeeping.' : isLog ? 'Your menu & inventory.' : isCalendar ? 'Plan your drops.' : 'Your drop checklist.' }}</h1></div>
      <button v-if="admin.authenticated.value && !admin.local" class="text-button admin-sign-out" type="button" aria-label="Sign out of admin" @click="signOut">Sign out</button>
      <span v-else class="admin-live"><span class="status-dot" />{{ adminPreview ? 'Preview' : 'Live' }}</span>
    </header>
    <header v-else class="app-header" :inert="cartOverlay" :aria-hidden="cartOverlay"><NuxtLink to="/" class="wordmark" aria-label="Tebu Drop home"><span class="brand-mark"><Leaf aria-hidden="true" :size="21" :stroke-width="2.3" /></span>tebu<span>drop.</span></NuxtLink><NuxtLink to="/admin" class="area-switch">Admin <ArrowUpRight aria-hidden="true" :size="12" /></NuxtLink></header>
    <OrderBar v-if="route.path === '/'" />
    <main ref="scrollArea" class="app-content"><p v-if="isAdmin && signOutError" class="error" role="alert">{{ signOutError }}</p><NuxtPage :transition="{ name: 'page', mode: 'out-in' }" /></main>
    <nav v-if="isAdmin" class="bottom-nav admin-bottom-nav" :style="{ '--admin-nav-index': adminNavIndex }" aria-label="Admin navigation">
      <span class="nav-indicator" aria-hidden="true" />
      <NuxtLink to="/admin" :class="{ active: route.path === '/admin' }"><ClipboardCheck aria-hidden="true" :size="18" />Checklist</NuxtLink>
      <NuxtLink to="/admin/calendar" :class="{ active: isCalendar }"><CalendarDays aria-hidden="true" :size="18" />Calendar</NuxtLink>
      <NuxtLink to="/admin/products" :class="{ active: ['/admin/log','/admin/products','/admin/finance','/admin/history'].includes(route.path) }"><BookOpen aria-hidden="true" :size="18" />Products</NuxtLink>
      <NuxtLink to="/admin/settings" :class="{ active: isSettings }"><Settings aria-hidden="true" :size="18" />Settings</NuxtLink>
    </nav>
    <nav v-else :class="['bottom-nav', { 'nav-second': secondNavItem }]" aria-label="Public navigation">
      <span class="nav-indicator" aria-hidden="true" />
      <NuxtLink to="/" :class="{ active: route.path === '/' }"><ShoppingBag aria-hidden="true" :size="18" />The drop</NuxtLink>
      <NuxtLink to="/drop" :class="{ active: route.path === '/drop' }"><History aria-hidden="true" :size="18" />Past transactions</NuxtLink>
    </nav>
    <Transition name="toast"><div v-if="shop.toast.value" class="toast" role="status">{{ shop.toast.value }}</div></Transition>
    <CheckoutDrawer />
  </div>
</template>
