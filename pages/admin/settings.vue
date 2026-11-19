<script setup lang="ts">
import { defaultShopSettings, editableSettings, shopSettingsInput, type EditableShopSettings, type ShopSettingsView } from '~/shared/settings'
import { defaultWhatsAppOpening, renderWhatsAppOpening, whatsAppOpeningMaxLength } from '~/shared/whatsapp'
const admin = useAdmin(), shop = useShop()
const draft = reactive<EditableShopSettings>({ ...defaultShopSettings })
const loading = ref(false), loaded = ref(false), busy = ref(false), error = ref(''), saved = ref(false), botConfigured = ref(false)
const invalidFields = ref<string[]>([]), baseline = ref('')
const dirty = computed(() => loaded.value && JSON.stringify(draft) !== baseline.value)
const preview = computed(() => renderWhatsAppOpening(draft.whatsappOpening, { name: 'Aina', tag: '#A01' }))
let request = 0
function apply(value: ShopSettingsView) {
  Object.assign(draft, editableSettings(value)); botConfigured.value = value.telegramBotConfigured
  baseline.value = JSON.stringify(draft); loaded.value = true
}
async function load() {
  const current = ++request
  loading.value = true; error.value = ''; invalidFields.value = []
  try {
    if (admin.local) {
      let stored = null
      try { stored = JSON.parse(localStorage.getItem('tebu_shop_settings') || 'null') } catch { /* Use the current demo defaults. */ }
      apply({ ...defaultShopSettings, ...shop.publicSettings.value, whatsappOpening: admin.whatsappOpening.value, ...stored, telegramEnabled: false, telegramBotConfigured: false })
    } else {
      const value = await $fetch<ShopSettingsView>('/api/admin/settings', { headers: admin.headers.value })
      if (current === request) apply(value)
    }
  } catch (e: any) { if (current === request) error.value = e.data?.message || 'Could not load settings. Try again.' }
  finally { if (current === request) loading.value = false }
}
async function save() {
  if (busy.value || !dirty.value) return
  error.value = ''; invalidFields.value = []; saved.value = false
  const parsed = shopSettingsInput(import.meta.dev).safeParse(draft)
  if (!parsed.success) { error.value = parsed.error.issues[0]?.message || 'Check the settings below.'; invalidFields.value = parsed.error.issues.map(issue => String(issue.path[0] || 'form')); return }
  busy.value = true
  try {
    let value: ShopSettingsView
    if (admin.local) {
      value = { ...draft, ...parsed.data, telegramEnabled: false, telegramBotConfigured: false }
      localStorage.setItem('tebu_shop_settings', JSON.stringify(editableSettings(value)))
      localStorage.setItem('tebu_whatsapp_opening', value.whatsappOpening)
    } else value = await $fetch<ShopSettingsView>('/api/admin/settings', { method: 'PUT', headers: admin.headers.value, body: parsed.data })
    apply(value); admin.whatsappOpening.value = value.whatsappOpening
    shop.publicSettings.value = { merchantName: value.merchantName, supportWhatsapp: value.supportWhatsapp }; shop.settingsLoaded.value = true
    saved.value = true
  } catch (e: any) { error.value = e.data?.message || 'Could not save settings. Please try again.'; invalidFields.value = e.data?.data?.fields || [] }
  finally { busy.value = false }
}
function invalid(field: string) { return invalidFields.value.includes(field) }
function description(field: string, help: string) { return invalid(field) ? `${help} settings-error` : help }
watch(admin.authenticated, value => { if (value) load() })
onMounted(() => { if (admin.authenticated.value) load() })
onBeforeUnmount(() => request++)
</script>
<template>
  <div class="inner-page settings-page">
    <AdminLogin v-if="!admin.authenticated.value" />
    <template v-else>
      <p class="ops-caption settings-intro">Save everyday shop settings here. Changes apply without restarting or redeploying.</p>
      <p v-if="admin.local" class="helper">Preview settings are saved on this device. Telegram delivery is available in the connected app.</p>
      <p v-if="loading" class="helper" role="status">Loading settings…</p>
      <template v-if="!loaded && error"><p class="error" role="alert">{{ error }}</p><button class="secondary" :disabled="loading" @click="load">Try again</button></template>
      <form v-if="loaded" class="settings-form" :aria-busy="busy || loading" @submit.prevent="save">
        <fieldset :disabled="busy || loading" class="settings-grid">
          <section class="settings-card" aria-labelledby="shop-details-heading">
            <h2 id="shop-details-heading">Shop details</h2>
            <label class="field-label" for="settings-merchant">Merchant display name</label>
            <input id="settings-merchant" v-model="draft.merchantName" class="input" required minlength="2" maxlength="100" autocomplete="organization" :aria-invalid="invalid('merchantName')" :aria-describedby="description('merchantName','merchant-help')" />
            <p id="merchant-help" class="helper">Shown beside the payment QR. This changes the label, not the bank account linked to the QR.</p>
            <label class="field-label" for="settings-support">Support WhatsApp number</label>
            <input id="settings-support" v-model="draft.supportWhatsapp" class="input" type="tel" maxlength="25" placeholder="60123456789" autocomplete="tel" :aria-invalid="invalid('supportWhatsapp')" :aria-describedby="description('supportWhatsapp','support-help')" />
            <p id="support-help" class="helper">Used for customer help and password recovery requests. Leave blank to hide the contact link.</p>
          </section>
          <section class="settings-card" aria-labelledby="telegram-heading">
            <h2 id="telegram-heading">Telegram alerts</h2>
            <p class="helper">One alert after a customer submits their receipt, with ticket and review links.</p>
            <p class="settings-bot-status">{{ botConfigured ? 'Bot token configured on the server.' : 'Add the bot token to server configuration to enable alerts.' }}</p>
            <label class="catalog-check" for="settings-telegram-enabled"><input id="settings-telegram-enabled" v-model="draft.telegramEnabled" type="checkbox" :disabled="admin.local || !botConfigured && !draft.telegramEnabled" :aria-invalid="invalid('telegramEnabled')" :aria-describedby="invalid('telegramEnabled') ? 'settings-error' : undefined" />Enable Telegram receipt alerts</label>
            <label class="field-label" for="settings-telegram-chat">Telegram chat ID</label>
            <input id="settings-telegram-chat" v-model="draft.telegramChatId" class="input" maxlength="20" inputmode="text" autocomplete="off" :aria-invalid="invalid('telegramChatId')" :aria-describedby="description('telegramChatId','telegram-chat-help')" />
            <p id="telegram-chat-help" class="helper">The numeric destination chat ID. This is separate from your phone number.</p>
          </section>
          <section class="settings-card" aria-labelledby="whatsapp-heading">
            <h2 id="whatsapp-heading">WhatsApp message</h2>
            <label class="field-label" for="whatsapp-opening">Message opening</label>
            <textarea id="whatsapp-opening" v-model="draft.whatsappOpening" class="input order-remarks-input" rows="5" required :maxlength="whatsAppOpeningMaxLength" :aria-invalid="invalid('whatsappOpening')" :aria-describedby="description('whatsappOpening','whatsapp-settings-help')" />
            <p id="whatsapp-settings-help" class="helper">Use {name} for the customer's name and {tag} for the order number. The customer ticket URL is always appended.</p>
            <div class="whatsapp-template-preview"><strong>Preview</strong><p>{{ preview }}</p><small>Followed by the customer's ticket link.</small></div>
            <button type="button" class="text-button" @click="draft.whatsappOpening = defaultWhatsAppOpening">Reset message to default</button>
          </section>
          <section class="settings-card" aria-labelledby="website-heading">
            <h2 id="website-heading">Website links</h2>
            <label class="field-label" for="settings-site-url">Website URL</label>
            <input id="settings-site-url" v-model="draft.siteUrl" class="input" type="url" maxlength="2048" placeholder="https://tebu.example.com" autocomplete="url" :aria-invalid="invalid('siteUrl')" :aria-describedby="description('siteUrl','website-help')" />
            <p id="website-help" class="helper">Used for Telegram ticket/review links, phone receipt uploads and recovery links. Enter the HTTPS website address without a path. A local HTTP address works during development.</p>
            <p v-if="!draft.siteUrl" class="helper">With no website URL, receipt links are detected automatically and Telegram alerts omit their links.</p>
            <p class="helper">Database, storage, admin credentials and the bot token remain in server configuration.</p>
          </section>
        </fieldset>
        <p v-if="error" id="settings-error" class="error" role="alert">{{ error }}</p>
        <div class="settings-actions"><p id="settings-save-status" class="helper" role="status">{{ saved && !dirty ? 'Settings saved. Changes are live.' : dirty ? 'You have unsaved changes.' : 'Edit a setting, then save your changes.' }}</p><button class="primary" type="submit" :disabled="busy || loading || !dirty" aria-describedby="settings-save-status">{{ busy ? 'Saving…' : 'Save changes' }}</button></div>
      </form>
    </template>
  </div>
</template>
