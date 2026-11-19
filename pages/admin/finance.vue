<script setup lang="ts">
import { ArrowDownLeft, ArrowUpRight, Plus, Pencil, Trash2, ReceiptText, Wallet } from '~/lib/icons'
import { Table, TableBody, TableCaption, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '~/components/ui/table'
import { money } from '~/shared/domain'
import type { Expense } from '~/composables/useLogs'

const admin = useAdmin()
const logs = useLogs()
const shop = useShop()
const error = ref('')
const dialog = ref<'expense' | null>(null)
const editingId = ref('')
const formError = ref('')
const expenseForm = reactive<{ date: string; amount: number | undefined; note: string }>({ date: '', amount: undefined, note: '' })
const deleting = ref<{ kind: 'expense'; id: string } | null>(null)
const paidOrders = computed(() => admin.orders.value.filter(order => ['confirmed', 'ready', 'collected'].includes(order.status) && order.manualPaymentStatus !== 'unpaid'))
const revenue = computed(() => admin.local ? paidOrders.value.reduce((sum, order) => sum + order.total - (order.refundedTotal||0), 0) : logs.revenue.value)
const paidOrderCount = computed(() => admin.local ? paidOrders.value.length : logs.paidOrderCount.value)
const expenses = computed(() => [...logs.expenses.value].sort((a, b) => b.date.localeCompare(a.date)))
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kuala_Lumpur', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
const dateLabel = (date: string) => new Date(`${date}T00:00:00Z`).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: '2-digit', timeZone: 'UTC' })

async function refresh() {
  error.value = ''
  try { await admin.refresh(); await logs.load() } catch { error.value = 'Could not load your records. Please refresh to try again.' }
}
let poll: ReturnType<typeof setInterval> | undefined
onMounted(async () => {
  if (admin.local || admin.authenticated.value) await refresh()
  if (!admin.local) poll = setInterval(() => { if (admin.authenticated.value && !logs.busy.value && !document.hidden) logs.load().catch(() => {}) }, 15000)
})
onBeforeUnmount(() => clearInterval(poll))
watch(admin.authenticated, value => { if (value && !admin.local) refresh() })

function openExpense(expense?: Expense) {
  editingId.value = expense?.id || ''
  Object.assign(expenseForm, { date: expense?.date || today(), amount: expense ? expense.amount / 100 : undefined, note: expense?.note || '' })
  formError.value = ''
  dialog.value = 'expense'
}

async function saveExpense() {
  const amount = Number(expenseForm.amount)
  if (!expenseForm.date || !/^\d+(\.\d{1,2})?$/.test(String(expenseForm.amount ?? '')) || !Number.isFinite(amount) || amount <= 0 || amount > 999999.99) {
    formError.value = 'Enter a date and an amount between RM 0.01 and RM 999,999.99, with up to two decimal places.'
    return
  }
  const expense: Expense = { id: editingId.value || crypto.randomUUID(), date: expenseForm.date, amount: Math.round(amount * 100), note: expenseForm.note.trim() }
  if (!await logs.saveRecord('expenses', expense, !!editingId.value)) { formError.value = logs.storageError.value; return }
  dialog.value = null
  shop.notify(editingId.value ? 'Expense updated.' : 'Expense added.')
}

async function removeRecord() {
  if (!deleting.value) return
  const { id } = deleting.value
  if (!await logs.remove('expenses', id)) return
  deleting.value = null
  shop.notify('Expense deleted.')
}
</script>

<template>
  <div class="inner-page log-page" :aria-busy="logs.busy.value">
    <p class="admin-page-intro">Revenue and expenses.</p>
    <p v-if="error || logs.storageError.value" class="error" role="alert">{{ error || logs.storageError.value }}</p>

    <AdminLogin v-if="!admin.authenticated.value" />
    <template v-if="admin.authenticated.value">
    <button v-if="logs.browserLogsAvailable.value && !admin.local" class="secondary full-width" :disabled="logs.busy.value" @click="logs.importBrowserLogs">Import saved browser logs</button>
    <div class="finance-grid">
      <article class="finance-card revenue-card">
        <div class="finance-card-label"><span>Revenue</span><span class="finance-icon"><ArrowDownLeft aria-hidden="true" :size="16" /></span></div>
        <strong data-testid="revenue-total">{{ money(revenue) }}</strong>
        <span class="finance-card-detail">{{ paidOrderCount }} payments after refunds{{ paidOrderCount === 1 ? '' : 's' }}</span>
        <div class="finance-card-foot"><span class="status-dot" /> {{ admin.local ? 'Preview orders' : 'Loaded orders' }}</div>
      </article>
      <article class="finance-card expenses-card">
        <div class="finance-card-label"><span>Expenses</span><span class="finance-icon"><ArrowUpRight aria-hidden="true" :size="16" /></span></div>
        <strong data-testid="expense-total">{{ money(logs.totalExpenses.value) }}</strong>
        <span class="finance-card-detail">{{ expenses.length }} expense{{ expenses.length === 1 ? '' : 's' }} logged</span>
        <div class="finance-card-foot"><Wallet aria-hidden="true" :size="11" /> All logged expenses</div>
      </article>
    </div>

    <section class="expenses-section" aria-labelledby="expenses-heading">
      <div class="section-heading log-section-heading">
        <div><span class="log-section-kicker"><ReceiptText aria-hidden="true" :size="12" /> MONEY OUT</span><h2 id="expenses-heading">Expenses.</h2></div>
        <button class="secondary small-action" @click="openExpense()"><Plus aria-hidden="true" :size="14" />Add expense</button>
      </div>
      <div class="log-table-card">
        <Table class="log-table">
          <TableCaption class="sr-only">Expense records with date and amount in Malaysian ringgit.</TableCaption>
          <TableHeader><TableRow><TableHead scope="col">Date</TableHead><TableHead scope="col" class="text-right">Amount</TableHead><TableHead scope="col" class="text-right"><span class="sr-only">Actions</span></TableHead></TableRow></TableHeader>
          <TableBody>
            <TableRow v-for="expense in expenses" :key="expense.id">
              <TableCell><time :datetime="expense.date">{{ dateLabel(expense.date) }}</time><small v-if="expense.note" class="table-note">{{ expense.note }}</small></TableCell>
              <TableCell class="text-right font-semibold tabular-nums">{{ money(expense.amount) }}</TableCell>
              <TableCell><div class="row-actions"><button class="table-action" :aria-label="`Edit expense ${dateLabel(expense.date)} ${money(expense.amount)}`" @click="openExpense(expense)"><Pencil aria-hidden="true" :size="13" /></button><button class="table-action delete-action" :aria-label="`Delete expense ${dateLabel(expense.date)} ${money(expense.amount)}`" @click="deleting = { kind: 'expense', id: expense.id }"><Trash2 aria-hidden="true" :size="13" /></button></div></TableCell>
            </TableRow>
            <TableRow v-if="!expenses.length"><TableCell colspan="3"><div class="table-empty"><ReceiptText aria-hidden="true" :size="25" :stroke-width="1.3" /><strong>No expenses yet.</strong><span>Add your first expense to start keeping track.</span></div></TableCell></TableRow>
          </TableBody>
          <TableFooter v-if="expenses.length"><TableRow><TableCell>Total expenses</TableCell><TableCell class="text-right tabular-nums">{{ money(logs.totalExpenses.value) }}</TableCell><TableCell /></TableRow></TableFooter>
        </Table>
      </div>
    </section>

    <NuxtLink to="/admin/products" class="text-button">Products & inventory →</NuxtLink>
    <p class="log-storage-note">{{ admin.local ? 'Demo logs are saved on this browser.' : 'Records are saved and shared across your devices.' }}</p>

    <RecordDialog :busy="logs.busy.value" :open="dialog === 'expense'" :title="editingId ? 'Edit expense.' : 'Add an expense.'" description="A date, an amount, and a little context if you like." @update:open="dialog = $event ? 'expense' : null">
      <form class="record-form" @submit.prevent="saveExpense">
        <label class="field-label" for="expense-date">Date</label><input id="expense-date" :aria-invalid="!!formError" :aria-describedby="formError ? 'log-form-error' : undefined" v-model="expenseForm.date" class="input" type="date" required />
        <label class="field-label" for="expense-amount">Amount (RM)</label><NumberInput id="expense-amount" :aria-invalid="!!formError" :aria-describedby="formError ? 'log-form-error' : undefined" v-model="expenseForm.amount" label="expense amount" :min="0.01" :max="999999.99" :step="0.01" :decimals="2" placeholder="0.00" required />
        <label class="field-label" for="expense-note">Note <span class="optional-label">optional</span></label><input id="expense-note" :aria-invalid="!!formError" :aria-describedby="formError ? 'log-form-error' : undefined" v-model="expenseForm.note" class="input" maxlength="120" placeholder="e.g. Bottles and paper bags" />
        <p v-if="formError" id="log-form-error" class="error" role="alert">{{ formError }}</p>
        <div class="record-form-actions"><button type="button" class="secondary" :disabled="logs.busy.value" @click="dialog = null">Cancel</button><button type="submit" class="primary" :disabled="logs.busy.value">{{ editingId ? 'Save changes' : 'Add expense' }}<Plus aria-hidden="true" v-if="!editingId" :size="14" /></button></div>
      </form>
    </RecordDialog>
    <ConfirmDialog :open="!!deleting" title="Delete this expense?" description="This record will be removed from your log. Existing reserved or sold bottles must remain covered by stock." confirm-label="Delete record" cancel-label="Keep record" :busy="logs.busy.value" :error="logs.storageError.value" @confirm="removeRecord" @update:open="deleting = $event ? deleting : null" />
    </template>
  </div>
</template>
