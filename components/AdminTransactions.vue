<script setup lang="ts">
import { NativeSelect, NativeSelectOption } from '~/components/ui/native-select'
import { emptyCart, bottleCount, money, ticketStatusLabel, type Ticket } from '~/shared/domain'
const props = defineProps<{ scheduleId: string; revision: number }>()
const emit = defineEmits<{ changed: [] }>()
const admin = useAdmin()
const shop = useShop()
const search = ref('')
const scope = ref('all')
const pageSize = ref('10')
const page = ref(1)
const rows = ref<Ticket[]>([])
const total = ref(0)
const loading = ref(false)
const busy = ref(false)
const error = ref('')
const formError = ref('')
const editing = ref<Ticket | null>(null)
const deleting = ref<Ticket | null>(null)
const details = ref<Ticket | null>(null)
const review = ref<{ order: Ticket; action: 'approve' | 'reject' } | null>(null)
const form = reactive({ name: '', scheduleId: '', varietyId: '', status: 'confirmed' as Ticket['status'], paymentStatus: 'paid', cart: emptyCart() })
const statuses: Ticket['status'][] = ['pending_payment', 'pending_review', 'confirmed', 'ready', 'collected', 'rejected']
const statusLabel = (status: Ticket['status']) => status.replaceAll('_', ' ').replace(/^./, letter => letter.toUpperCase())
const pages = computed(() => Math.max(1, Math.ceil(total.value / Number(pageSize.value))))
const start = computed(() => total.value ? (page.value - 1) * Number(pageSize.value) + 1 : 0)
const editTotal = computed(() => shop.products.reduce((sum, product) => sum + form.cart[product.id] * (editing.value?.items?.find(item => item.productId === product.id)?.unitPrice ?? product.price), 0))
let request = 0
let searchTimer: ReturnType<typeof setTimeout> | undefined
async function load() {
  const current = ++request
  loading.value = true; error.value = ''
  try {
    if (admin.local) {
      const needle = search.value.trim().toLowerCase()
      const filtered = admin.orders.value.filter(order => (scope.value !== 'day' || order.scheduleId === props.scheduleId) && (!needle || [order.tag, order.name, order.phone, order.scheduleId, order.varietyName, order.status, ticketStatusLabel(order)].join(' ').toLowerCase().includes(needle))).sort((a, b) => b.scheduleId.localeCompare(a.scheduleId) || b.createdAt.localeCompare(a.createdAt))
      total.value = filtered.length
      page.value = Math.min(page.value, pages.value)
      rows.value = filtered.slice((page.value - 1) * Number(pageSize.value), page.value * Number(pageSize.value))
    } else {
      const data = await $fetch<{ orders: Ticket[]; total: number; page: number }>('/api/admin/orders', { headers: admin.headers.value, query: { search: search.value.trim(), ...(scope.value === 'day' ? { date: props.scheduleId } : {}), page: page.value, pageSize: Number(pageSize.value) } })
      if (current !== request) return
      rows.value = data.orders; total.value = data.total; page.value = data.page
    }
  } catch (e: any) { if (current === request) { rows.value = []; total.value = 0; error.value = e.data?.message || 'Could not load transactions. Try refreshing.' } }
  finally { if (current === request) loading.value = false }
}
function reset() { if (page.value !== 1) page.value = 1; else load() }
watch(search, () => { clearTimeout(searchTimer); searchTimer = setTimeout(reset, 250) })
watch([scope, pageSize], reset)
watch(page, load)
watch(() => props.scheduleId, () => { scope.value = 'day'; reset() })
watch(() => props.revision, load)
onMounted(load)
onBeforeUnmount(() => { request++; clearTimeout(searchTimer) })
function edit(order: Ticket) {
  formError.value = ''
  Object.assign(form, { name: order.name, scheduleId: order.scheduleId, varietyId: order.varietyId || admin.varieties.value[0]?.id || '', status: order.status, paymentStatus: order.manualPaymentStatus || 'paid', cart: { ...order.cart } })
  editing.value = order
}
function persistDemo() {
  // Write the explicit archive changes before merging any customer updates.
  if (!import.meta.client) return
  shop.tickets.value = admin.orders.value.map(order => ({ ...order, cart: { ...order.cart } }))
  localStorage.setItem('tebu_demo_orders', JSON.stringify(shop.tickets.value))
  localStorage.setItem('tebu_admin_orders', JSON.stringify(admin.orders.value))
  admin.persist()
}
async function saved() { await admin.refresh(); await shop.refreshDrops(); await load(); emit('changed') }
async function save() {
  if (!editing.value || busy.value) return
  if (!form.name.trim() || !form.scheduleId || !form.varietyId || !bottleCount(form.cart)) { formError.value = 'Enter a customer, date, variety and at least one bottle.'; return }
  busy.value = true; formError.value = ''; admin.invalidate()
  try {
    if (admin.local) {
      const order = admin.orders.value.find(row => row.token === editing.value!.token)!
      const changed = order.scheduleId !== form.scheduleId || order.varietyId !== form.varietyId || JSON.stringify(order.cart) !== JSON.stringify(form.cart)
      const used = admin.orders.value.filter(row => row.token !== order.token && row.scheduleId === form.scheduleId && row.status !== 'rejected' && (row.status !== 'pending_payment' || !!row.expiresAt && new Date(row.expiresAt).getTime() > Date.now()))
      const day = shop.days.value.find(row => row.id === form.scheduleId)
      if (form.status !== 'rejected' && (used.reduce((n, row) => n + row.cart.flask, 0) + form.cart.flask > (day?.flaskCapacity ?? 8) || used.reduce((n, row) => n + row.cart.jug, 0) + form.cart.jug > (day?.jugCapacity ?? 3))) throw new Error('This date does not have enough bottle capacity.')
      if (order.scheduleId !== form.scheduleId) { const sequence = Math.max(0, ...admin.orders.value.filter(row => row.scheduleId === form.scheduleId).map(row => Number(row.tag.slice(2)))) + 1; order.tag = `#A${String(sequence).padStart(2, '0')}` }
      Object.assign(order, { name: form.name.trim(), scheduleId: form.scheduleId, varietyId: form.varietyId, varietyName: admin.varieties.value.find(v => v.id === form.varietyId)?.name, status: form.status, cart: { ...form.cart }, total: editTotal.value, packed: ['ready', 'collected'].includes(form.status) || form.status === 'confirmed' && !changed && order.packed, ...(order.manualPaymentStatus ? { manualPaymentStatus: form.paymentStatus } : {}) })
      persistDemo()
    } else await $fetch(`/api/admin/orders/${editing.value.token}`, { method: 'PATCH', headers: admin.headers.value, body: { name: form.name, scheduleId: form.scheduleId, varietyId: form.varietyId, status: form.status, cart: form.cart, ...(editing.value.manualPaymentStatus ? { paymentStatus: form.paymentStatus } : {}) } })
    await saved(); editing.value = null; shop.notify('Transaction updated.')
  } catch (e: any) { formError.value = e.data?.message || e.message || 'Could not update this transaction.' }
  finally { busy.value = false }
}
async function remove() {
  if (!deleting.value || busy.value) return
  busy.value = true; formError.value = ''; admin.invalidate()
  try {
    if (admin.local) { admin.orders.value = admin.orders.value.filter(order => order.token !== deleting.value!.token); persistDemo() }
    else await $fetch(`/api/admin/orders/${deleting.value.token}`, { method: 'DELETE', headers: admin.headers.value })
    await saved(); deleting.value = null; shop.notify('Transaction deleted. Stock and totals updated.')
  } catch (e: any) { formError.value = e.data?.message || 'Could not delete this transaction.' }
  finally { busy.value = false }
}
async function reviewPayment() {
  if (!review.value || busy.value) return
  busy.value = true; formError.value = ''; admin.invalidate()
  try {
    if (admin.local) { const order = admin.orders.value.find(row => row.token === review.value!.order.token)!; order.status = review.value.action === 'approve' ? 'confirmed' : 'rejected'; persistDemo() }
    else await $fetch('/api/admin', { method: 'PATCH', headers: admin.headers.value, body: { action: review.value.action, orderToken: review.value.order.token } })
    review.value = null; details.value = null; await saved(); shop.notify('Payment review saved.')
  } catch (e: any) { formError.value = e.data?.message || 'Could not review this payment.' }
  finally { busy.value = false }
}
</script>
<template>
  <section class="admin-transaction-history" aria-labelledby="transaction-history-heading" :aria-busy="loading || busy">
    <div class="section-heading"><div><h2 id="transaction-history-heading">Transactions</h2><p class="ops-caption">Search all dates, review payments and manage order records.</p></div><button class="secondary" :disabled="loading || busy" @click="load">Refresh transactions</button></div>
    <div class="transaction-filters">
      <div class="transaction-search"><label class="field-label" for="transaction-search">Search transactions</label><input id="transaction-search" class="input" v-model="search" type="search" placeholder="Name, phone, tag, date or status" maxlength="100" /></div>
      <div><label class="field-label" for="transaction-scope">Dates</label><NativeSelect id="transaction-scope" v-model="scope"><NativeSelectOption value="all">All dates</NativeSelectOption><NativeSelectOption value="day">{{ scheduleId }}</NativeSelectOption></NativeSelect></div>
      <div><label class="field-label" for="transaction-page-size">Rows per page</label><NativeSelect id="transaction-page-size" v-model="pageSize"><NativeSelectOption v-for="size in [10,25,50,100]" :key="size" :value="String(size)">{{ size }}</NativeSelectOption></NativeSelect></div>
    </div>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <AdminOrdersTable :orders="rows" manage :busy="busy || loading" @details="order => details = order" @edit="edit" @delete="order => { formError = ''; deleting = order }" />
    <div class="transaction-pagination"><p role="status">{{ loading ? 'Loading transactions…' : `${start}–${Math.min(page * Number(pageSize), total)} of ${total} transactions` }}</p><nav aria-label="Transaction pages"><button class="secondary" :disabled="page <= 1 || loading" @click="page--">Previous</button><span>Page {{ page }} of {{ pages }}</span><button class="secondary" :disabled="page >= pages || loading" @click="page++">Next</button></nav></div>
    <RecordDialog :open="!!editing" :busy="busy" :title="`Edit transaction ${editing?.tag || ''}`" description="Update the order record. Bottle availability and daily limits are checked when you save." @update:open="value => { if (!value) editing = null }">
      <form class="record-form" @submit.prevent="save">
        <label class="field-label" for="transaction-name">Customer name</label><input id="transaction-name" class="input" type="text" v-model="form.name" maxlength="80" required :aria-invalid="!!formError" :aria-describedby="formError ? 'transaction-edit-error' : undefined" />
        <label class="field-label" for="transaction-date">Drop date</label><input id="transaction-date" class="input" v-model="form.scheduleId" type="date" required :aria-invalid="!!formError" :aria-describedby="formError ? 'transaction-edit-error' : undefined" />
        <label class="field-label" for="transaction-variety">Tebu variety</label><NativeSelect id="transaction-variety" v-model="form.varietyId" required><NativeSelectOption v-for="variety in admin.varieties.value" :key="variety.id" :value="variety.id">{{ variety.name }}</NativeSelectOption></NativeSelect>
        <div v-for="product in shop.products" :key="product.id"><label class="field-label" :for="`transaction-${product.id}`">{{ product.name }} · {{ product.size }}</label><NumberInput :id="`transaction-${product.id}`" v-model="form.cart[product.id]" :label="`Edit ${product.name} quantity`" :min="0" :max="10000" required :aria-invalid="!!formError" :aria-describedby="formError ? 'transaction-edit-error' : undefined" /></div>
        <label class="field-label" for="transaction-status">Order status</label><NativeSelect id="transaction-status" v-model="form.status"><NativeSelectOption v-for="status in statuses.filter(status => !editing?.manualPaymentStatus || !['pending_payment','pending_review'].includes(status))" :key="status" :value="status">{{ statusLabel(status) }}</NativeSelectOption></NativeSelect>
        <template v-if="editing?.manualPaymentStatus"><label class="field-label" for="transaction-payment">Manual payment</label><NativeSelect id="transaction-payment" v-model="form.paymentStatus"><NativeSelectOption value="paid">Paid</NativeSelectOption><NativeSelectOption value="unpaid">Unpaid</NativeSelectOption></NativeSelect></template>
        <p class="helper">Total: <strong>{{ money(editTotal) }}</strong></p><p v-if="formError" id="transaction-edit-error" class="error" role="alert">{{ formError }}</p>
        <div class="record-form-actions"><button type="button" class="secondary" :disabled="busy" @click="editing = null">Cancel</button><button class="primary" :disabled="busy">{{ busy ? 'Saving…' : 'Save changes' }}</button></div>
      </form>
    </RecordDialog>
    <ConfirmDialog :open="!!deleting" title="Delete this transaction?" :description="`${deleting?.tag || ''} for ${deleting?.name || ''} will be permanently removed, including its receipt and customer ticket. Stock and financial totals will be recalculated.`" confirm-label="Delete transaction" :busy="busy" :error="formError" @confirm="remove" @update:open="value => { if (!value) deleting = null }" />
    <AdminTransactionDetails :order="details" :busy="busy" @close="details = null" @action="(order, action) => { details = null; formError = ''; review = { order, action } }" />
    <ConfirmDialog :open="!!review" :title="review?.action === 'approve' ? 'Confirm this payment?' : 'Reject this receipt?'" :description="`Update the payment review for ${review?.order.tag || ''}. Confirmed orders appear in their day's packing list.`" :confirm-label="review?.action === 'approve' ? 'Confirm payment' : 'Reject receipt'" :destructive="review?.action === 'reject'" :busy="busy" :error="formError" @confirm="reviewPayment" @update:open="value => { if (!value) review = null }" />
  </section>
</template>
