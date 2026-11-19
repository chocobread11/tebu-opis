<script setup lang="ts">
import { money, bottleCount, ticketStatusLabel, type Ticket } from '~/shared/domain'
import { ChevronRight } from '~/lib/icons'
const shop = useShop()
const access = useCustomerAccess()
const recoveryHelp=computed(()=>{const contact=String(shop.publicSettings.value.supportWhatsapp||'').replace(/\D/g,'');return /^60\d{8,11}$/.test(contact)?`https://wa.me/${contact}?text=${encodeURIComponent(`Hi, I forgot my Tebu Drop history password for ${phone.value}. Please help me recover access.`)}`:''})
const phone = ref('')
const password = ref('')
const passwordRequired = ref(false)
const unlocked = ref(false)
const searched = ref(false)
const busy = ref(false)
const error = ref('')
const currentPassword = ref('')
const newPassword = ref('')
const privacyMessage = ref('')
const passwordInput = ref<HTMLInputElement | null>(null)
let poll: ReturnType<typeof setInterval> | undefined
let refreshing = false
const history = computed(() => unlocked.value ? [...shop.tickets.value].filter(order => !shop.demo || order.phone === shop.customerPhone.value).sort((a, b) => b.createdAt.localeCompare(a.createdAt)) : [])
const mainCount = (order: Ticket) => order.items?.filter(item => (item.kind || (['asam','limau'].includes(item.productId) ? 'addon' : 'bottle')) === 'bottle').reduce((sum,item) => sum+item.quantity,0) ?? bottleCount(order.cart)
const dateLabel = (date: string) => new Date(`${date}T00:00:00Z`).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
function resetSearch() { unlocked.value = false; passwordRequired.value = false; searched.value = false; password.value = ''; error.value = ''; privacyMessage.value = ''; access.unlockedPhone.value = '' }
async function lookup() {
  busy.value = true; error.value = ''; unlocked.value = false
  try {
    const result = await access.identify({ phone: phone.value, password: password.value || undefined, mode: 'history' })
    searched.value = true
    passwordRequired.value = result.passwordRequired
    if (result.passwordRequired) { await nextTick(); passwordInput.value?.focus({ preventScroll: true }); return }
    password.value = ''
    if (!result.found) return
    await shop.refreshTickets()
    phone.value = shop.customerPhone.value
    unlocked.value = true
  } catch (e: any) { error.value = e.data?.message || e.message || 'Could not load your transactions.' }
  finally { busy.value = false }
}
async function saveProtection(remove = false) {
  busy.value = true; error.value = ''; privacyMessage.value = ''
  try {
    await access.setProtection(remove ? null : newPassword.value, currentPassword.value || undefined)
    currentPassword.value = ''; newPassword.value = ''
    privacyMessage.value = remove ? 'Password removed. Anyone with your phone number can view your history.' : 'Your history is now protected with a password.'
  } catch (e: any) { error.value = e.data?.message || e.message || 'Could not change protection.' }
  finally { busy.value = false }
}
async function lockHistory() {
  busy.value = true; error.value = ''
  try { await access.signOut(); resetSearch(); searched.value = true; passwordRequired.value = access.protectedHistory.value }
  catch { error.value = 'Could not lock your history. Please try again.' }
  finally { busy.value = false }
}
async function refreshStatus() {
  if (!unlocked.value || busy.value || refreshing || document.hidden) return
  if (shop.demo && access.demoSession()?.phone !== shop.customerPhone.value) {
    unlocked.value = false; passwordRequired.value = access.protectedHistory.value
    error.value = 'Your session expired. Look up your transactions again.'
    return
  }
  refreshing = true
  try { await shop.refreshTickets() }
  catch (e: any) {
    if (e.status === 401 || e.statusCode === 401) {
      unlocked.value = false; passwordRequired.value = access.protectedHistory.value
      error.value = 'Your session expired. Look up your transactions again.'
    }
  } finally { refreshing = false }
}
function onStorage(event: StorageEvent) { if (event.key === 'tebu_demo_orders') refreshStatus() }
onMounted(async () => {
  poll = setInterval(refreshStatus, 5000)
  document.addEventListener('visibilitychange', refreshStatus)
  window.addEventListener('storage', onStorage)
  shop.load(); phone.value = shop.customerPhone.value
  if (phone.value) await lookup()
})
onBeforeUnmount(() => {
  clearInterval(poll); document.removeEventListener('visibilitychange', refreshStatus); window.removeEventListener('storage', onStorage)
})
</script>
<template>
  <section class="transaction-lookup" aria-label="Find past transactions" :aria-busy="busy">
    <form class="history-lookup-form" @submit.prevent="lookup">
      <div><label class="field-label" for="history-phone">Mobile number</label><input id="history-phone" v-model="phone" class="input" type="tel" inputmode="tel" autocomplete="tel" placeholder="012 345 6789" maxlength="20" required :aria-invalid="!!error" :aria-describedby="error ? 'history-error' : 'history-help'" @input="resetSearch" /></div>
      <div v-if="passwordRequired"><label class="field-label" for="history-password">History password</label><input id="history-password" ref="passwordInput" v-model="password" class="input" type="password" autocomplete="current-password" maxlength="128" required :aria-invalid="!!error" :aria-describedby="error ? 'history-error' : undefined" /></div>
      <button class="primary" :disabled="busy">{{ busy ? 'Loading…' : passwordRequired ? 'Unlock transactions' : 'View transactions' }}</button>
    </form>
    <p id="history-help" class="helper">Your phone number is remembered. After unlocking, your history stays signed in for 30 minutes on this device. Your password is never saved.</p>
    <p v-if="error" id="history-error" class="error" role="alert">{{ error }}</p>
    <p v-if="passwordRequired && !unlocked" class="helper">This phone number has password protection. Enter its history password to continue.</p>
    <p v-if="passwordRequired&&!unlocked" class="helper">Forgot your password? <a v-if="recoveryHelp" :href="recoveryHelp" class="text-button" target="_blank" rel="noopener noreferrer">Ask the operator for a recovery link</a><span v-else>Contact the operator for a recovery link.</span> Your order history will stay intact.</p>
    <template v-if="unlocked">
      <div class="section-heading"><div><h2>{{ shop.customerName.value }}’s transactions</h2><span class="subtle">{{ history.length }} transaction{{ history.length === 1 ? '' : 's' }}</span></div><button type="button" class="secondary small-action" :disabled="busy" @click="lockHistory">Lock history</button></div>
      <p v-if="history.length" class="helper history-table-help">Select an order to view its pickup ticket.</p>
      <div class="log-table-card customer-history-table">
        <table class="log-table"><caption class="sr-only">Past transactions for {{ shop.customerPhone.value }}. Select an order to view its pickup ticket.</caption><thead><tr><th scope="col">Order / drop date</th><th scope="col">Items</th><th scope="col">Total</th><th scope="col">Status</th></tr></thead>
          <tbody><tr v-for="order in history" :key="order.token" class="history-row"><td><NuxtLink :to="`/drop?t=${order.token}`" class="history-order-link" :aria-label="`View pickup ticket ${order.tag} for ${dateLabel(order.scheduleId)}`"><strong>{{ order.tag }}</strong><ChevronRight aria-hidden="true" :size="14" /></NuxtLink><span class="table-note">{{ dateLabel(order.scheduleId) }}</span></td><td>{{ mainCount(order) }} item{{ mainCount(order) === 1 ? '' : 's' }}<span class="table-note">{{ order.varietyName }}</span><OrderRemarks :value="order.remarks" compact preview /></td><td class="history-total">{{ money(order.total) }}</td><td><span :class="['transaction-status', order.status]">{{ ticketStatusLabel(order) }}</span></td></tr>
          <tr v-if="!history.length"><td colspan="4" class="table-empty"><strong>No transactions yet.</strong><span>Completed checkout orders will appear here.</span></td></tr></tbody>
        </table>
      </div>
      <details class="history-privacy"><summary>Privacy settings · {{ access.protectedHistory.value ? 'Password protected' : 'No password' }}</summary>
        <p class="helper">{{ access.protectedHistory.value ? 'Enter your current password to change or remove protection.' : 'Without a password, anyone who knows this number can view its transactions.' }}</p>
        <form @submit.prevent="saveProtection()">
          <template v-if="access.protectedHistory.value"><label class="field-label" for="history-current-password">Current password</label><input id="history-current-password" v-model="currentPassword" class="input" type="password" autocomplete="current-password" maxlength="128" required :aria-describedby="error ? 'history-error' : undefined" /></template>
          <label class="field-label" for="history-new-password">{{ access.protectedHistory.value ? 'New password' : 'Create password' }}</label><input id="history-new-password" v-model="newPassword" class="input" type="password" autocomplete="new-password" minlength="8" maxlength="128" required :aria-describedby="error ? 'history-error' : undefined" />
          <div class="record-form-actions"><button v-if="access.protectedHistory.value" class="secondary" type="button" :disabled="busy" @click="saveProtection(true)">Remove password</button><button class="primary" :disabled="busy">Save password</button></div>
        </form>
        <p v-if="privacyMessage" class="helper" role="status">{{ privacyMessage }}</p>
      </details>
    </template>
    <div v-else-if="searched && !passwordRequired && !busy && !error" class="empty-state"><h2>No transactions found.</h2><p>Check your phone number, or place your first order.</p><NuxtLink class="primary" to="/">Browse bottles</NuxtLink></div>
  </section>
</template>
