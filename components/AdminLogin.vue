<script setup lang="ts">
const admin = useAdmin()
const { adminKey } = admin
const busy = ref(false)
const error = ref('')
async function login() {
  busy.value = true; error.value = ''
  try { await admin.refresh() }
  catch (e: any) { error.value = e.data?.message || 'Could not sign in. Check your admin key.' }
  finally { busy.value = false }
}
</script>
<template>
  <form class="login-card" @submit.prevent="login">
    <label class="field-label" for="admin-key">Admin key</label>
    <input id="admin-key" :aria-invalid="!!error" :aria-describedby="error ? 'admin-login-error' : undefined" v-model="adminKey" class="input" type="password" required autocomplete="off" />
    <p v-if="error" id="admin-login-error" class="error" role="alert">{{ error }}</p>
    <button class="primary full-width" :disabled="busy">{{ busy ? 'Opening…' : 'Open pantry ops' }}</button>
  </form>
</template>
