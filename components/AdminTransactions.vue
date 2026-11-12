<script setup lang="ts">
import { orderRemarksMaxLength } from '~/shared/order'
import { NativeSelect, NativeSelectOption } from '~/components/ui/native-select'
import { emptyCart, bottleCount, bottleSpaces, dailyBottleCapacity, money, ticketStatusLabel, type Ticket } from '~/shared/domain'
import { paymentStatus, paymentLabels, paymentStatuses, paymentChanges, type PaymentStatus } from '~/shared/payment'
import { RefreshCw } from '~/lib/icons'
const props = defineProps<{ scheduleId: string; revision: number }>()
const emit = defineEmits<{ changed: [] }>()
const admin = useAdmin()
const shop = useShop()
const search = ref('')
const scope = ref('all')
const payment = ref<PaymentStatus | 'all'>('all')
const pageSize = ref('10')
const page = ref(1)
const rows = ref<Ticket[]>([])
const total = ref(0)
const loading = ref(false)
const busy = ref(false)
const error = ref('')
const formError = ref('')
const paymentError = ref('')
const editing = ref<Ticket | null>(null)
const deleting = ref<Ticket | null>(null)
const details = ref<Ticket | null>(null)
const form = reactive({ name: '', scheduleId: '', varietyId: '', status: 'confirmed' as Ticket['status'], paymentStatus: 'paid', remarks: '', cart: emptyCart() })
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
      const filtered = admin.orders.value.filter(order => (scope.value !== 'day' || order.scheduleId === props.scheduleId) && (payment.value === 'all' || paymentStatus(order) === payment.value) && (!needle || [order.tag, order.name, order.phone, order.scheduleId, order.varietyName, order.remarks, order.status, ticketStatusLabel(order)].join(' ').toLowerCase().includes(needle))).sort((a, b) => b.scheduleId.localeCompare(a.scheduleId) || b.createdAt.localeCompare(a.createdAt))
      total.value = filtered.length
      page.value = Math.min(page.value, pages.value)
      rows.value = filtered.slice((page.value - 1) * Number(pageSize.value), page.value * Number(pageSize.value))
    } else {
      const data = await $fetch<{ orders: Ticket[]; total: number; page: number }>('/api/admin/orders', { headers: admin.headers.value, query: { search: search.value.trim(), ...(scope.value === 'day' ? { date: props.scheduleId } : {}), ...(payment.value !== 'all' ? { paymentStatus: payment.value } : {}), page: page.value, pageSize: Number(pageSize.value) } })
      if (current !== request) return
      rows.value = data.orders; total.value = data.total; page.value = data.page
    }
  } catch (e: any) { if (current === request) { rows.value = []; total.value = 0; error.value = e.data?.message || 'Could not load transactions. Try refreshing.' } }
  finally { if (current === request) loading.value = false }
}
function reset() { if (page.value !== 1) page.value = 1; else load() }
watch(search, () => { clearTimeout(searchTimer); searchTimer = setTimeout(reset, 250) })
watch([scope, pageSize, payment], reset)
watch(page, load)
watch(() => props.scheduleId, () => { scope.value = 'day'; reset() })
watch(() => props.revision, load)
onMounted(load)
onBeforeUnmount(() => { request++; clearTimeout(searchTimer) })
function edit(order: Ticket) {
  formError.value = ''
  Object.assign(form, { name: order.name, remarks: order.remarks || '', scheduleId: order.scheduleId, varietyId: order.varietyId || admin.varieties.value[0]?.id || '', status: order.status, paymentStatus: order.manualPaymentStatus || 'paid', cart: { ...order.cart } })
  editing.value = order
}
function openDetails(order: Ticket) { paymentError.value = ''; details.value = order }
async function editDetails(order: Ticket) { details.value = null; await nextTick(); edit(order) }
async function deleteDetails(order: Ticket) { details.value = null; await nextTick(); formError.value = ''; deleting.value = order }
function persistDemo() {
  // Write the explicit archive changes before merging any customer updates.
  if (!import.meta.client) return
  shop.tickets.value = admin.orders.value.map(order => ({ ...order, cart: { ...order.cart } }))
  localStorage.setItem('tebu_demo_orders', JSON.stringify(shop.tickets.value))
  localStorage.setItem('tebu_admin_orders', JSON.stringify(admin.orders.value))
  admin.persist()
}
async function saved() { await load(); emit('changed') }
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
      if (form.status !== 'rejected' && used.reduce((sum, row) => sum + bottleSpaces(row.cart), 0) + bottleSpaces(form.cart) > (day?.capacity ?? dailyBottleCapacity)) throw new Error('This date does not have enough bottle capacity.')
      if (order.scheduleId !== form.scheduleId) { const sequence = Math.max(0, ...admin.orders.value.filter(row => row.scheduleId === form.scheduleId).map(row => Number(row.tag.slice(2)))) + 1; order.tag = `#A${String(sequence).padStart(2, '0')}` }
      Object.assign(order, { name: form.name.trim(), remarks: form.remarks.trim() || undefined, scheduleId: form.scheduleId, varietyId: form.varietyId, varietyName: admin.varieties.value.find(v => v.id === form.varietyId)?.name, status: form.status, cart: { ...form.cart }, total: editTotal.value, packed: ['ready', 'collected'].includes(form.status) || form.status === 'confirmed' && !changed && order.packed, ...(order.manualPaymentStatus ? { manualPaymentStatus: form.paymentStatus } : {}) })
      persistDemo()
    } else await $fetch(`/api/admin/orders/${editing.value.token}`, { method: 'PATCH', headers: admin.headers.value, body: { name: form.name, remarks: form.remarks.trim() || null, scheduleId: form.scheduleId, varietyId: form.varietyId, status: form.status, cart: form.cart, ...(editing.value.manualPaymentStatus ? { paymentStatus: form.paymentStatus } : {}) } })
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
async function updatePayment(order: Ticket, next: PaymentStatus) {
  if (busy.value || paymentStatus(order) === next) return
  busy.value = true; paymentError.value = ''; admin.invalidate()
  try {
    let updated: Ticket
    if (admin.local) {
      const current = admin.orders.value.find(row => row.token === order.token)
      if (!current || current.status !== order.status || paymentStatus(current) !== paymentStatus(order)) throw new Error('This transaction changed. Refresh it before changing payment.')
      const changes = paymentChanges(current, next)
      if (changes.status && changes.status !== 'rejected') {
        const day = shop.days.value.find(day => day.id === current.scheduleId)
        const used = admin.orders.value.filter(row => row.token !== current.token && row.scheduleId === current.scheduleId && row.status !== 'rejected' && (row.status !== 'pending_payment' || !!row.expiresAt && new Date(row.expiresAt).getTime() > Date.now()))
        if (used.reduce((sum, row) => sum + bottleSpaces(row.cart), 0) + bottleSpaces(current.cart) > (day?.capacity ?? dailyBottleCapacity)) throw new Error('This date does not have enough bottle capacity.')
      }
      Object.assign(current, changes); updated = { ...current }; persistDemo()
    } else {
      const result = await $fetch<{ order: Ticket }>(`/api/admin/orders/${order.token}/payment`, { method: 'PATCH', headers: admin.headers.value, body: { paymentStatus: next, expectedStatus: order.status, expectedPaymentStatus: paymentStatus(order) } })
      updated = result.order
    }
    if (details.value?.token === order.token) details.value = updated
    await saved(); shop.notify(`Payment marked ${paymentLabels[next].toLowerCase()}.`)
  } catch (e: any) { paymentError.value = e.data?.message || e.message || 'Could not update payment. Try again.' }
  finally { busy.value = false }
}
</script>
<template>
  <section class="admin-transaction-history" aria-labelledby="transaction-history-heading" :aria-busy="loading || busy">
    <div class="section-heading"><div><h2 id="transaction-history-heading">Transactions</h2><p class="ops-caption">Open a row for details. Change payment from its badge.</p></div><button class="secondary small-action" :disabled="loading || busy" @click="load"><RefreshCw aria-hidden="true" :size="14" />Refresh transactions</button></div>
    <div class="transaction-filters">
      <div class="transaction-search"><label class="field-label" for="transaction-search">Search transactions</label><input id="transaction-search" class="input" v-model="search" type="search" placeholder="Name, phone, tag, date or status" maxlength="100" /></div>
      <div><label class="field-label" for="transaction-scope">Dates</label><NativeSelect id="transaction-scope" v-model="scope"><NativeSelectOption value="all">All dates</NativeSelectOption><NativeSelectOption value="day">{{ scheduleId }}</NativeSelectOption></NativeSelect></div>
      <div><label class="field-label" for="transaction-payment-filter">Payment status</label><NativeSelect id="transaction-payment-filter" v-model="payment"><NativeSelectOption value="all">All payments</NativeSelectOption><NativeSelectOption v-for="status in paymentStatuses" :key="status" :value="status">{{ status === 'rejected' ? 'Rejected / cancelled' : paymentLabels[status] }}</NativeSelectOption></NativeSelect></div>
      <div><label class="field-label" for="transaction-page-size">Rows per page</label><NativeSelect id="transaction-page-size" v-model="pageSize"><NativeSelectOption v-for="size in [10,25,50,100]" :key="size" :value="String(size)">{{ size }}</NativeSelectOption></NativeSelect></div>
    </div>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <p v-if="paymentError && !details" class="error" role="alert">{{ paymentError }}</p>
    <AdminOrdersTable :orders="rows" manage :busy="busy || loading" @details="openDetails" @edit="edit" @payment="updatePayment" />
    <div class="transaction-pagination"><p role="status">{{ loading ? 'Loading transactions…' : `${start}–${Math.min(page * Number(pageSize), total)} of ${total} transactions` }}</p><nav aria-label="Transaction pages"><button class="secondary" :disabled="page <= 1 || loading" @click="page--">Previous</button><span>Page {{ page }} of {{ pages }}</span><button class="secondary" :disabled="page >= pages || loading" @click="page++">Next</button></nav></div>
    <RecordDialog :open="!!editing" :busy="busy" :title="`Edit transaction ${editing?.tag || ''}`" description="Update the order record. Bottle availability and daily limits are checked when you save." @update:open="value => { if (!value) editing = null }">
      <form class="record-form" @submit.prevent="save">
        <label class="field-label" for="transaction-name">Customer name</label><input id="transaction-name" class="input" type="text" v-model="form.name" maxlength="80" required :aria-invalid="!!formError" :aria-describedby="formError ? 'transaction-edit-error' : undefined" />
        <label class="field-label" for="transaction-date">Drop date</label><input id="transaction-date" class="input" v-model="form.scheduleId" type="date" required :aria-invalid="!!formError" :aria-describedby="formError ? 'transaction-edit-error' : undefined" />
        <label class="field-label" for="transaction-variety">Tebu variety</label><NativeSelect id="transaction-variety" v-model="form.varietyId" required><NativeSelectOption v-for="variety in admin.varieties.value" :key="variety.id" :value="variety.id">{{ variety.name }}</NativeSelectOption></NativeSelect>
        <div v-for="product in shop.products" :key="product.id"><label class="field-label" :for="`transaction-${product.id}`">{{ product.name }} · {{ product.size }}</label><NumberInput :id="`transaction-${product.id}`" v-model="form.cart[product.id]" :label="`Edit ${product.name} quantity`" :min="0" :max="10000" required :aria-invalid="!!formError" :aria-describedby="formError ? 'transaction-edit-error' : undefined" /></div>
        <label class="field-label" for="transaction-remarks">Remarks (optional)</label><textarea id="transaction-remarks" v-model="form.remarks" class="input order-remarks-input" rows="3" :maxlength="orderRemarksMaxLength" :aria-invalid="!!formError" :aria-describedby="formError ? 'transaction-edit-error' : undefined" />
        <label class="field-label" for="transaction-status">Order status</label><NativeSelect id="transaction-status" v-model="form.status"><NativeSelectOption v-for="status in statuses.filter(status => !editing?.manualPaymentStatus || !['pending_payment','pending_review'].includes(status))" :key="status" :value="status">{{ statusLabel(status) }}</NativeSelectOption></NativeSelect>
        <template v-if="editing?.manualPaymentStatus"><label class="field-label" for="transaction-payment">Manual payment</label><NativeSelect id="transaction-payment" v-model="form.paymentStatus"><NativeSelectOption value="paid">Paid</NativeSelectOption><NativeSelectOption value="unpaid">Unpaid</NativeSelectOption></NativeSelect></template>
        <p class="helper">Total: <strong>{{ money(editTotal) }}</strong></p><p v-if="formError" id="transaction-edit-error" class="error" role="alert">{{ formError }}</p>
        <div class="record-form-actions"><button type="button" class="secondary" :disabled="busy" @click="editing = null">Cancel</button><button class="primary" :disabled="busy">{{ busy ? 'Saving…' : 'Save changes' }}</button></div>
      </form>
    </RecordDialog>
    <ConfirmDialog :open="!!deleting" title="Delete this transaction?" :description="`${deleting?.tag || ''} for ${deleting?.name || ''} will be permanently removed, including its receipt and customer ticket. Stock and financial totals will be recalculated.`" confirm-label="Delete transaction" :busy="busy" :error="formError" @confirm="remove" @update:open="value => { if (!value) deleting = null }" />
    <AdminTransactionDetails :order="details" :busy="busy" :payment-error="paymentError" @close="details = null" @payment="updatePayment" @edit="editDetails" @delete="deleteDetails" />
  </section>
</template>
