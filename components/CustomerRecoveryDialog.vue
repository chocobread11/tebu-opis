<script setup lang="ts">
const admin=useAdmin(),shop=useShop()
const open=ref(false),phone=ref(''),customer=ref<{name:string;phone:string;protected:boolean;orders:number}|null>(null),verified=ref(false),url=ref(''),expires=ref(''),busy=ref(false),error=ref('')
watch(phone,()=>{customer.value=null;verified.value=false;url.value='';error.value=''})
async function find(){
 busy.value=true;error.value='';customer.value=null;url.value='';verified.value=false
 try{const result=await $fetch<{customer:typeof customer.value}>('/api/admin/customers',{headers:admin.headers.value,query:{phone:phone.value}});customer.value=result.customer;if(!customer.value)error.value='No customer is registered with this number.'}catch(e:any){error.value=e.data?.message||'Could not find this customer.'}finally{busy.value=false}
}
async function create(){
 busy.value=true;error.value=''
 try{const result=await $fetch<{url:string;expiresAt:string}>('/api/admin/recovery',{method:'POST',headers:admin.headers.value,body:{phone:customer.value?.phone,verified:verified.value}});url.value=result.url;expires.value=result.expiresAt}catch(e:any){error.value=e.data?.message||'Could not create the recovery link.'}finally{busy.value=false}
}
async function copy(){try{await navigator.clipboard.writeText(url.value);shop.notify('Recovery link copied. Share it privately with the verified customer.')}catch{error.value='Copy the recovery link from the field below.'}}
</script>
<template>
 <button v-if="!admin.local" class="secondary small-action" @click="open=true">Customer recovery</button>
 <RecordDialog :open="open" :busy="busy" content-class="customer-recovery-dialog" title="Customer password recovery" description="Verify the customer through your existing WhatsApp contact before sharing a private reset link. Their order history stays intact." @update:open="value=>{if(!busy)open=value}">
  <div class="customer-recovery-content">
  <form class="record-form customer-recovery-form" @submit.prevent="find"><label class="field-label" for="recovery-phone">Customer mobile number</label><input id="recovery-phone" v-model="phone" class="input" type="tel" maxlength="20" required :aria-invalid="!!error" :aria-describedby="error?'customer-recovery-error':undefined"/><button class="secondary" :disabled="busy">Find customer</button></form>
  <div v-if="customer" class="customer-recovery-panel"><p class="helper">{{customer.name}} · {{customer.phone}} · {{customer.orders}} orders</p><label class="catalog-check"><input v-model="verified" type="checkbox" :disabled="busy"/>I verified this customer through their existing contact.</label><button class="primary" :disabled="busy||!verified" @click="create">Create one-time recovery link</button></div>
  <div v-if="url" class="customer-recovery-panel"><label class="field-label" for="recovery-link">Private recovery link</label><input id="recovery-link" class="input" :value="url" readonly @focus="($event.target as HTMLInputElement).select()"/><p class="helper">Expires {{new Date(expires).toLocaleString('en-MY')}}. Share it only with the verified customer.</p><button class="secondary" @click="copy">Copy recovery link</button></div>
  <p v-if="error" id="customer-recovery-error" class="error" role="alert">{{error}}</p>
  </div>
 </RecordDialog>
</template>
