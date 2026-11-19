<script setup lang="ts">
const admin = useAdmin()
const { adminKey } = admin
const busy = ref(false)
const error = ref('')
const checking = ref(true)
onMounted(async () => { await admin.restore(); checking.value = false })
async function login() {
  busy.value = true; error.value = ''
  try { await admin.signIn() }
  catch (e: any) { error.value = e.data?.message || 'Could not sign in. Check your admin key.' }
  finally { busy.value = false }
}
</script>
<template>
  <div v-if="checking" class="login-card" aria-busy="true"><p class="helper" role="status">Checking admin sign-in…</p></div>
  <form v-else class="login-card" @submit.prevent="login">
    <label class="field-label" for="admin-key">Admin key</label>
    <input id="admin-key" :aria-invalid="!!error" :aria-describedby="error ? 'admin-login-error' : undefined" v-model="adminKey" class="input" type="password" required autocomplete="current-password" />
    <p v-if="!admin.local" class="helper">Stay signed in on this browser for 12 hours. You can sign out at any time.</p>
    <p v-if="error" id="admin-login-error" class="error" role="alert">{{ error }}</p>
    <button class="primary full-width" :disabled="busy">{{ busy ? 'Opening…' : 'Open pantry ops' }}</button>
  </form>
</template>
