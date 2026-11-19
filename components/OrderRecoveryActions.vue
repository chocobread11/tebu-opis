<script setup lang="ts">
import {money,type Ticket} from '~/shared/domain'
import {paymentStatus} from '~/shared/payment'
import {reservationExpired} from '~/shared/order'
const props=defineProps<{order:Ticket}>(),emit=defineEmits<{changed:[order:Ticket]}>()
const admin=useAdmin(),shop=useShop()
const open=ref(false),busy=ref(false),error=ref(''),amount=ref<number>(),reason=ref(''),cancel=ref(false),requestId=ref(''),uploadUrl=ref('')
const remaining=computed(()=>props.order.total-(props.order.refundedTotal||0))
const refundable=computed(()=>paymentStatus(props.order)==='paid'&&remaining.value>0&&!admin.local)
const reopenable=computed(()=>!props.order.manualPaymentStatus&&!props.order.fulfilled&&!props.order.refundedTotal&&(props.order.status==='rejected'||reservationExpired(props.order))&&!admin.local)
function start(){requestId.value=crypto.randomUUID();amount.value=remaining.value/100;reason.value='';cancel.value=false;error.value='';open.value=true}
async function refund(){busy.value=true;error.value='';try{const result=await $fetch<{order:Ticket}>(`/api/admin/orders/${props.order.token}/refund`,{method:'POST',headers:admin.headers.value,body:{requestId:requestId.value,amount:Math.round(Number(amount.value)*100),reason:reason.value,cancelOrder:cancel.value}});emit('changed',result.order);open.value=false;shop.notify('Refund recorded. Inventory changes only for a separately recorded return.')}catch(e:any){error.value=e.data?.message||'Could not record this refund.'}finally{busy.value=false}}
async function reopen(){busy.value=true;error.value='';try{const result=await $fetch<{order:Ticket;receiptUploadUrl:string}>(`/api/admin/orders/${props.order.token}/reopen`,{method:'POST',headers:admin.headers.value,body:{}});uploadUrl.value=result.receiptUploadUrl;emit('changed',result.order);shop.notify('Receipt upload reopened for 20 minutes.')}catch(e:any){error.value=e.data?.message||'Could not reopen this order.'}finally{busy.value=false}}
async function copy(){try{await navigator.clipboard.writeText(uploadUrl.value);shop.notify('Private receipt upload link copied.')}catch{error.value='Select and copy the link below.'}}
</script>
<template>
 <div class="order-recovery-actions">
  <p v-if="order.refundedTotal" class="helper">Refunds recorded: {{money(order.refundedTotal)}}</p>
  <div class="row-actions"><button v-if="refundable" class="secondary small-action" :disabled="busy" @click="start">Record refund</button><button v-if="reopenable" class="secondary small-action" :disabled="busy" @click="reopen">Reopen receipt upload</button></div>
  <div v-if="uploadUrl"><label class="field-label" for="reopened-receipt-link">Private receipt upload link</label><input id="reopened-receipt-link" class="input" :value="uploadUrl" readonly/><button class="text-button" @click="copy">Copy upload link</button></div>
  <p v-if="error&&!open" class="error" role="alert">{{error}}</p>
 </div>
 <RecordDialog :open="open" :busy="busy" title="Record refund" description="Record a refund you have already sent. This does not send money or add bottles to stock." @update:open="value=>{if(!busy)open=value}">
  <form class="record-form" @submit.prevent="refund"><p class="helper">Remaining refundable payment: {{money(remaining)}}</p><label class="field-label" for="refund-amount">Refund amount (RM)</label><NumberInput id="refund-amount" v-model="amount" label="refund amount" :min="0.01" :max="remaining/100" :step="0.01" :decimals="2" required/>
   <label class="field-label" for="refund-reason">Refund reason</label><textarea id="refund-reason" v-model="reason" class="input order-remarks-input" minlength="3" maxlength="300" required :aria-invalid="!!error" :aria-describedby="error?'refund-error':undefined"/>
   <label v-if="!order.fulfilled&&order.status!=='collected'" class="catalog-check"><input v-model="cancel" type="checkbox"/>Cancel the uncollected order after a full refund and release its reservation.</label><p v-else class="helper">This order was collected. Its bottle quantities remain in the sales log.</p>
   <p v-if="error" id="refund-error" class="error" role="alert">{{error}}</p><div class="record-form-actions"><button class="secondary" type="button" :disabled="busy" @click="open=false">Cancel</button><button class="primary" :disabled="busy">Record refund</button></div>
  </form>
 </RecordDialog>
</template>
