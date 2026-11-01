<script setup lang="ts">
import { Plus } from 'lucide-vue-next'
import { NativeSelect, NativeSelectOption } from '~/components/ui/native-select'
import { emptyCart, bottleCount, total, money, cartSummary, malaysiaToday, normalizePhone, type Ticket } from '~/shared/domain'
const props = defineProps<{ scheduleId: string }>()
const emit = defineEmits<{ changed: [] }>()
const admin = useAdmin()
const shop = useShop()
const open = ref(false)
const busy = ref(false)
const error = ref('')
const cancelling = ref<Ticket | null>(null)
const requestId = ref('')
const form = reactive({ name: '', phone: '', date: '', varietyId: '', paymentStatus: 'unpaid' as 'paid' | 'unpaid', cart: emptyCart() })
const orders = computed(() => admin.orders.value.filter(order => order.scheduleId === props.scheduleId && order.manualPaymentStatus))
function start() {
  Object.assign(form, { name: '', phone: '', date: props.scheduleId || malaysiaToday(), varietyId: admin.varieties.value[0]?.id || '', paymentStatus: 'unpaid', cart: emptyCart() })
  requestId.value = crypto.randomUUID(); error.value = ''; open.value = true
}
async function save() {
  if (busy.value) return
  if (!form.name.trim() || !form.date || !bottleCount(form.cart)) { error.value = 'Enter a customer, date and at least one bottle.'; return }
  busy.value = true; error.value = ''
  try {
    if (admin.local) {
      const phone = form.phone ? normalizePhone(form.phone) : ''
      const sequence = admin.orders.value.filter(order => order.scheduleId === form.date).length + 1
      admin.orders.value.unshift({ token: crypto.randomUUID(), tag: `#A${String(sequence).padStart(2, '0')}`, name: form.name.trim(), phone, scheduleId: form.date, varietyId: form.varietyId, varietyName: admin.varieties.value.find(v => v.id === form.varietyId)?.name, cart: { ...form.cart }, total: total(form.cart, shop.products), status: 'confirmed', manualPaymentStatus: form.paymentStatus, packed: false, notified: false, createdAt: new Date().toISOString() })
      admin.persist()
    } else {
      await $fetch('/api/admin/orders', { method: 'POST', headers: admin.headers.value, body: { requestId: requestId.value, scheduleId: form.date, name: form.name, phone: form.phone, varietyId: form.varietyId, paymentStatus: form.paymentStatus, cart: form.cart } })
      await admin.refresh()
    }
    open.value = false; emit('changed'); shop.notify('Manual order saved. Inventory updated.')
  } catch (e: any) { error.value = e.data?.message || e.message || 'Could not save this order.' }
  finally { busy.value = false }
}
async function update(order: Ticket, cancel = false) {
  busy.value = true; error.value = ''
  const paymentStatus = order.manualPaymentStatus === 'paid' ? 'unpaid' : 'paid'
  try {
    if (admin.local) { if (cancel) order.status = 'rejected'; else order.manualPaymentStatus = paymentStatus; admin.persist() }
    else { await $fetch('/api/admin', { method: 'PATCH', headers: admin.headers.value, body: { action: cancel ? 'cancel-manual' : 'manual-payment', orderToken: order.token, ...(cancel ? {} : { paymentStatus }) } }); await admin.refresh() }
    if (cancel) cancelling.value = null
    emit('changed'); shop.notify(cancel ? 'Manual order cancelled. Stock released.' : 'Payment status updated.')
  } catch (e: any) { error.value = e.data?.message || 'Could not update the manual order.' }
  finally { busy.value = false }
}
</script>
<template>
  <section class="ops-section manual-orders" :aria-busy="busy">
    <div class="section-heading"><div><h2>Manual orders</h2><p class="ops-caption">Standard per day: 8 small · 3 big. Paid and unpaid orders reserve stock; paid orders count toward profit.</p></div><button class="primary" @click="start"><Plus aria-hidden="true" :size="16" />Add order</button></div>
    <p v-if="!orders.length" class="helper">No manual orders for this date. Use Add order to record an offline sale.</p>
    <p v-if="error && !open && !cancelling" class="error" role="alert">{{ error }}</p>
    <article v-for="order in orders" :key="order.token" class="review-card">
      <div class="review-head"><strong>{{ order.tag }} · {{ order.name }}</strong><b>{{ money(order.total) }}</b></div>
      <p>{{ order.varietyName }} · {{ cartSummary(order.cart, shop.products) }}</p>
      <div class="review-actions"><span class="ops-badge">{{ order.status === 'rejected' ? 'Cancelled' : order.manualPaymentStatus === 'paid' ? 'Paid' : 'Unpaid' }}</span><template v-if="order.status !== 'rejected'"><button class="text-button danger" :disabled="busy" @click="error = ''; cancelling = order">Cancel order</button><button class="secondary" :disabled="busy" @click="update(order)">Mark {{ order.manualPaymentStatus === 'paid' ? 'unpaid' : 'paid' }}</button></template></div>
    </article>
    <RecordDialog :busy="busy" :open="open" title="Add manual order" description="Record an offline sale, reserve bottles and track payment. Phone is optional." @update:open="value => { if (!busy) open = value }">
      <form class="manual-order-form" :aria-busy="busy" @submit.prevent="save">
        <div><label class="field-label" for="manual-name">Customer name</label><input id="manual-name" :aria-invalid="!!error" :aria-describedby="error ? 'manual-order-error' : undefined" v-model="form.name" maxlength="80" required /></div>
        <div><label class="field-label" for="manual-phone">Phone (optional)</label><input id="manual-phone" :aria-invalid="!!error" :aria-describedby="error ? 'manual-order-error' : undefined" v-model="form.phone" type="tel" placeholder="012 345 6789" /></div>
        <div><label class="field-label" for="manual-date">Order date</label><input id="manual-date" :aria-invalid="!!error" :aria-describedby="error ? 'manual-order-error' : undefined" v-model="form.date" type="date" required /></div>
        <div><label class="field-label" for="manual-variety">Tebu variety</label><NativeSelect id="manual-variety" :aria-invalid="!!error" :aria-describedby="error ? 'manual-order-error' : undefined" v-model="form.varietyId" required><NativeSelectOption v-for="variety in admin.varieties.value" :key="variety.id" :value="variety.id">{{ variety.name }} · {{ variety.flaskRemaining }} small / {{ variety.jugRemaining }} big available</NativeSelectOption></NativeSelect></div>
        <div v-for="product in shop.products" :key="product.id"><label class="field-label" :for="`manual-${product.id}`">{{ product.name }} ({{ product.size }}) · {{ money(product.price) }}</label><NumberInput :id="`manual-${product.id}`" :aria-invalid="!!error" :aria-describedby="error ? 'manual-order-error' : undefined" v-model="form.cart[product.id]" :label="product.name" :min="0" :max="10000" required /></div>
        <div><label class="field-label" for="manual-payment">Payment status</label><NativeSelect id="manual-payment" :aria-invalid="!!error" :aria-describedby="error ? 'manual-order-error' : undefined" v-model="form.paymentStatus"><NativeSelectOption value="unpaid">Unpaid</NativeSelectOption><NativeSelectOption value="paid">Paid</NativeSelectOption></NativeSelect></div>
        <p><strong>Total: {{ money(total(form.cart, shop.products)) }}</strong></p>
        <p v-if="error" id="manual-order-error" class="error" role="alert">{{ error }}</p>
        <div class="record-form-actions"><button class="secondary" type="button" :disabled="busy" @click="open = false">Cancel</button><button class="primary" :disabled="busy">{{ busy ? 'Saving…' : 'Save order' }}</button></div>
      </form>
    </RecordDialog>
    <ConfirmDialog :open="!!cancelling" title="Cancel this manual order?" :description="`Order ${cancelling?.tag || ''} will be cancelled and its bottles returned to available stock.`" confirm-label="Cancel order" cancel-label="Keep order" :busy="busy" :error="error" @confirm="cancelling && update(cancelling, true)" @update:open="value => { if (!value) cancelling = null }" />
  </section>
</template>
<style scoped>
.manual-orders { margin-block: 20px; }
.manual-orders .section-heading { flex-wrap: wrap; gap: 12px; }
.manual-order-form { display: grid; gap: 14px; }
.manual-order-form input { width: 100%; min-width: 0; min-height: 44px; padding: 10px 12px; border: 1px solid var(--ui-control-line); border-radius: 10px; background: white; color: inherit; }
</style>
