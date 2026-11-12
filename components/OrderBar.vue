<script setup lang="ts">
import { ArrowRight, ChevronDown, Zap } from '~/lib/icons'
import { bottleCount, money } from '~/shared/domain'

const shop = useShop()
const items = computed(() => shop.products.filter(product => shop.cart.value[product.id] > 0).map(product => ({
  ...product,
  quantity: shop.cart.value[product.id],
  lineTotal: product.price * shop.cart.value[product.id],
})))
const hasItems = computed(() => items.value.length > 0)
const itemCount = computed(() => items.value.reduce((sum, item) => sum + item.quantity, 0))
const chosen = computed(() => shop.drops.value.find(drop => drop.id === shop.selected.value))
const count = computed(() => bottleCount(shop.cart.value))
const detailsOpen = ref(false)
const detailsId = useId()
watch(itemCount, (value, previous) => {
  if (value > (previous ?? 0)) detailsOpen.value = true
  else if (!value) detailsOpen.value = false
}, { immediate: true })

function checkout() {
  if (!count.value) return shop.notify('Add Botol Kecik or Botol Besar to get started.')
  if (!chosen.value || !chosen.value.remaining) return shop.notify('Choose an open delivery date from the calendar.')
  if (!shop.variety.value) return shop.notify('Choose your tebu variety.')
  if (shop.cart.value.kecik > shop.available('kecik') || shop.cart.value.besar > shop.available('besar')) return shop.notify('Stock has changed. Adjust your bottle quantity.')
  shop.checkoutOpen.value = true
}
</script>

<template>
  <section v-if="hasItems" class="order-bar-slot" aria-label="Your order">
    <div class="order-bar-clip">
      <div class="order-bar">
        <div class="order-bar-summary">
          <div>
            <button type="button" class="order-details-toggle" :aria-expanded="detailsOpen" :aria-controls="detailsId" aria-label="Order details" @click="detailsOpen = !detailsOpen">
              <span>{{ itemCount }} items<span v-if="chosen"> · {{ chosen.day }}</span></span>
              <ChevronDown aria-hidden="true" :size="12" :class="{ 'details-open': detailsOpen }" />
            </button>
            <strong>{{ money(shop.amount.value) }}</strong>
          </div>
          <button class="primary" @click="checkout"><Zap aria-hidden="true" :size="16" fill="currentColor" />LOCK MY BOTTLE<ArrowRight aria-hidden="true" :size="17" /></button>
        </div>
        <Transition name="order-details">
          <ul v-show="detailsOpen" :id="detailsId" class="order-bar-items" aria-label="Items in your order">
            <li v-for="item in items" :key="item.id" class="order-item">
              <span class="order-item-quantity">{{ item.quantity }}×</span>
              <span class="order-item-details"><span>{{ item.name }}</span><small class="order-item-size">{{ item.size }}</small></span>
              <span class="order-item-price">{{ money(item.lineTotal) }}</span>
            </li>
          </ul>
        </Transition>
      </div>
    </div>
  </section>
</template>
