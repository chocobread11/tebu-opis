<script setup lang="ts">
import { ArrowRight, Zap } from 'lucide-vue-next'
import { bottleCount, money } from '~/shared/domain'

const shop = useShop()
const items = computed(() => shop.products.filter(product => shop.cart.value[product.id] > 0).map(product => ({
  ...product,
  quantity: shop.cart.value[product.id],
  lineTotal: product.price * shop.cart.value[product.id],
})))
const hasItems = computed(() => items.value.length > 0)
const chosen = computed(() => shop.drops.value.find(drop => drop.id === shop.selected.value))
const count = computed(() => bottleCount(shop.cart.value))

function checkout() {
  if (!count.value) return shop.notify('Add a flask or jug to get started.')
  if (!chosen.value || !chosen.value.remaining) return shop.notify('Choose an open delivery date from the calendar.')
  if (!shop.variety.value) return shop.notify('Choose your tebu variety.')
  if (shop.cart.value.flask > shop.available('flask') || shop.cart.value.jug > shop.available('jug')) return shop.notify('Stock has changed. Adjust your bottle quantity.')
  shop.checkoutOpen.value = true
}
</script>

<template>
  <Transition name="order-bar">
    <section v-if="hasItems" class="order-bar-slot" aria-label="Your order">
      <div class="order-bar-clip">
        <div class="order-bar">
          <div class="order-bar-summary">
            <div><small>{{ count ? `${count} BOTTLE${count > 1 ? 'S' : ''} · ${chosen?.day.toUpperCase() || ''} DROP` : 'YOUR NEXT LITTLE PICK-ME-UP' }}</small><strong>{{ money(shop.amount.value) }}</strong><small>{{ shop.variety.value?.name }}</small></div>
            <button class="primary" @click="checkout"><Zap aria-hidden="true" :size="16" fill="currentColor" />LOCK MY BOTTLE<ArrowRight aria-hidden="true" :size="17" /></button>
          </div>
          <TransitionGroup name="order-item" tag="ul" class="order-bar-items" aria-label="Items in your order">
            <li v-for="item in items" :key="item.id" class="order-item">
              <span class="order-item-quantity">{{ item.quantity }}×</span>
              <span class="order-item-details"><span>{{ item.name }}</span><small class="order-item-size">{{ item.size }}</small></span>
              <span class="order-item-price">{{ money(item.lineTotal) }}</span>
            </li>
          </TransitionGroup>
        </div>
      </div>
    </section>
  </Transition>
</template>
