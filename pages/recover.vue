<script setup lang="ts">
const password=ref(''),confirmation=ref(''),token=ref(''),busy=ref(false),error=ref(''),complete=ref(false)
const shop=useShop()
useHead({title:'Recover your history · Tebu Drop',meta:[{name:'robots',content:'noindex, nofollow'}]})
onMounted(()=>{token.value=location.hash.slice(1)})
async function recover(){
 if(password.value!==confirmation.value){error.value='The passwords do not match.';return}
 busy.value=true;error.value=''
 try{
  const result=await $fetch<{ok:boolean;phone:string}>('/api/identity/recover',{method:'POST',body:{token:token.value,password:password.value}})
  if(result.phone){shop.customerPhone.value=result.phone;localStorage.setItem('customer_phone',result.phone)}
  password.value='';confirmation.value='';token.value='';history.replaceState(null,'',location.pathname);complete.value=true
 }catch(e:any){error.value=e.data?.message||'Could not reset your password. Ask the operator for a new link.'}finally{busy.value=false}
}
</script>
<template>
 <div class="inner-page recovery-page"><h1 class="page-title">Recover your history</h1>
  <template v-if="complete"><p role="status">Your password is updated. Your order history is still here, and previous history sessions have been signed out.</p><NuxtLink to="/drop" class="primary">Open my transactions</NuxtLink></template>
  <form v-else class="record-form" @submit.prevent="recover"><p class="helper">Use the private recovery link provided by the operator. It expires after 30 minutes and works once.</p>
   <label class="field-label" for="recovery-password">New history password</label><input id="recovery-password" v-model="password" class="input" type="password" autocomplete="new-password" minlength="8" maxlength="128" required :aria-invalid="!!error" :aria-describedby="error?'recovery-error':undefined"/>
   <label class="field-label" for="recovery-confirmation">Confirm new password</label><input id="recovery-confirmation" v-model="confirmation" class="input" type="password" autocomplete="new-password" minlength="8" maxlength="128" required :aria-invalid="!!error" :aria-describedby="error?'recovery-error':undefined"/>
   <p v-if="error" id="recovery-error" class="error" role="alert">{{error}}</p><button class="primary" :disabled="busy||!token">{{busy?'Updating…':'Set new password'}}</button>
  </form>
 </div>
</template>
