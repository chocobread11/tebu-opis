<script setup lang="ts">
import { Plus, Pencil, Trash2 } from '~/lib/icons'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell, TableCaption } from '~/components/ui/table'
import { NativeSelect, NativeSelectOption } from '~/components/ui/native-select'
import { money,malaysiaToday,type Product } from '~/shared/domain'
import type {StockRecord} from '~/composables/useProducts'
import {compressImage} from '~/utils/compress'
import {storefrontImages} from '~/lib/storefront-images'
const admin=useAdmin(), manager=useProducts(),shop=useShop()
const error=ref(''),formError=ref(''),editing=ref(''),dialog=ref<'product'|'stock'|null>(null),stockId=ref(''),deleting=ref<StockRecord|null>(null)
const showArchived=ref(false),filter=ref(''),search=ref(''),pageSize=ref('10'),page=ref(1)
const form=reactive({name:'',size:'',description:'',kind:'bottle',price:undefined as number|undefined,active:true,spaceCost:1,trackStock:true,varietyTracked:false,sortOrder:0})
const stock=reactive({kind:'restock' as 'restock'|'adjustment',productId:'',date:malaysiaToday(),quantity:undefined as number|undefined,note:''})
const file=shallowRef<File|null>(null),preview=ref('')
const filteredRows=computed(()=>{
 const needle=search.value.trim().toLowerCase()
 return manager.entries.value.filter(row=>(!filter.value||row.productId===filter.value)&&(!needle||[row.product?.name||entryProduct(row)?.name,row.product?.size||entryProduct(row)?.size,row.date.slice(0,10),dateLabel(row.date),row.quantity,row.kind,row.note].join(' ').toLowerCase().includes(needle))).sort((a,b)=>b.date.localeCompare(a.date))
})
const pageCount=computed(()=>Math.max(1,Math.ceil(filteredRows.value.length/Number(pageSize.value))))
const rowStart=computed(()=>filteredRows.value.length?(page.value-1)*Number(pageSize.value)+1:0)
const rows=computed(()=>filteredRows.value.slice((page.value-1)*Number(pageSize.value),page.value*Number(pageSize.value)))
watch([search,filter,pageSize],()=>{page.value=1})
watch(pageCount,count=>{page.value=Math.min(page.value,count)})
const stockProduct=computed(()=>manager.products.value.find(p=>p.id===stock.productId))
const restockLog=ref<HTMLElement|null>(null)
function productStock(product:Product){return product.stocks?.[0]||{remaining:0,stocked:0,reserved:0}}
function stockUnit(product:Pick<Product,'kind'|'size'>|undefined,quantity=2){return product?.kind==='bottle'&&/^\d+(?:\.\d+)?\s*(?:ml|l)$/i.test(product.size)?quantity===1?'bottle':'bottles':quantity===1?'item':'items'}
function entryProduct(row:StockRecord){return manager.products.value.find(p=>p.id===row.productId)}
function dateLabel(date:string){return new Date(`${date.slice(0,10)}T00:00:00Z`).toLocaleDateString('en-MY',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'})}
async function viewRestocks(product:Product){search.value='';filter.value=product.id;await nextTick();restockLog.value?.focus({preventScroll:true});restockLog.value?.scrollIntoView({block:'start'})}
const stockAfterSave=computed(()=>{
 if(!stockProduct.value)return 0
 const original=manager.entries.value.find(row=>row.id===stockId.value&&row.productId===stock.productId)
 return productStock(stockProduct.value).remaining+Number(stock.quantity||0)-(original?.quantity||0)
})
function image(p:Product){return p.imageUrl||(storefrontImages as Record<string,string>)[p.id]||''}
let previewRequest=0
function clearImage(){previewRequest++;if(preview.value.startsWith('blob:'))URL.revokeObjectURL(preview.value);preview.value='';file.value=null}
async function refresh(){error.value='';try{await manager.load();await shop.refreshDrops()}catch(e:any){error.value=e.data?.message||e.message||'Could not load products.'}}
let poll: ReturnType<typeof setInterval> | undefined
onMounted(()=>{if(admin.authenticated.value||admin.local)refresh();if(!admin.local)poll=setInterval(()=>{if(admin.authenticated.value&&!manager.busy.value&&!dialog.value&&!document.hidden)manager.load().catch(()=>{})},15000)})
watch(admin.authenticated,value=>{if(value)refresh()})
onBeforeUnmount(()=>{clearImage();clearInterval(poll)})
watch(()=>form.kind,kind=>{if(!editing.value)form.spaceCost=kind==='addon'?0:1})
async function openProduct(p?:Product,kind='bottle'){
 clearImage();editing.value=p?.id||'';formError.value=''
 Object.assign(form,{name:p?.name||'',size:p?.size||'',description:p?.description||'',kind:p?.kind||kind,price:p?p.price/100:undefined,active:p?.active!==false,spaceCost:p?.spaceCost??(kind==='addon'?0:1),trackStock:p?.trackStock!==false,varietyTracked:false,sortOrder:p?.sortOrder??manager.products.value.length})
 preview.value=p&&!(p.imageUrl&&p.active===false&&!admin.local)?image(p):'';dialog.value='product'
 if(p?.imageUrl&&p.active===false&&!admin.local){
  const request=previewRequest
  try{const blob=await $fetch<Blob>(p.imageUrl,{headers:admin.headers.value,responseType:'blob'});if(request===previewRequest&&dialog.value==='product'&&editing.value===p.id)preview.value=URL.createObjectURL(blob)}
  catch{if(request===previewRequest)formError.value='Could not load the current image. You can choose a replacement.'}
 }
}
async function choose(event:Event){const selected=(event.target as HTMLInputElement).files?.[0];if(!selected)return;manager.busy.value=true;formError.value='';try{clearImage();file.value=await compressImage(selected);preview.value=URL.createObjectURL(file.value)}catch(e:any){formError.value=e.message}finally{manager.busy.value=false}}
async function saveProduct(){
 manager.busy.value=true;formError.value=''
 try{
  if(!form.name.trim()||!form.size.trim()||!Number.isFinite(form.price)||Number(form.price)<=0)throw new Error('Enter the product name, unit and price.')
  const row=await manager.saveProduct({...form,name:form.name.trim(),size:form.size.trim(),price:Math.round(Number(form.price)*100)},editing.value||undefined)
  editing.value=row.id
  if(file.value){
   if(admin.local){const data=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=reject;reader.readAsDataURL(file.value!)});const p=manager.products.value.find(p=>p.id===row.id)!;p.imageUrl=data;manager.persist()}
   else{const body=new FormData();body.set('file',file.value);await $fetch(`/api/admin/products/${row.id}/image`,{method:'POST',headers:admin.headers.value,body})}
  }
  dialog.value=null;clearImage();await refresh();shop.notify('Product saved.')
 }catch(e:any){formError.value=e.data?.message||e.message||'Could not save this product.'}finally{manager.busy.value=false}
}
function openStock(p?:Product,row?:StockRecord){stockId.value=row?.id||'';Object.assign(stock,{kind:row?.kind||'restock',productId:row?.productId||p?.id||manager.products.value[0]?.id||'',date:row?.date.slice(0,10)||malaysiaToday(),quantity:row?.quantity,note:row?.note||''});formError.value='';dialog.value='stock'}
async function saveStock(){manager.busy.value=true;formError.value='';try{await manager.saveStock({...stock,quantity:Number(stock.quantity)},stockId.value||undefined);dialog.value=null;await refresh();shop.notify('Inventory updated.')}catch(e:any){formError.value=e.data?.message||e.message||'Could not save stock.'}finally{manager.busy.value=false}}
async function remove(){if(!deleting.value)return;manager.busy.value=true;formError.value='';try{await manager.removeStock(deleting.value.id);deleting.value=null;await refresh();shop.notify('Stock entry removed.')}catch(e:any){formError.value=e.data?.message||e.message||'Could not remove stock.'}finally{manager.busy.value=false}}
</script>
<template>
 <div class="inner-page ops-page catalog-page">
  <AdminLogin v-if="!admin.authenticated.value" />
  <template v-else>
   <div class="section-heading"><div><h2>Products & inventory</h2><p class="ops-caption">Manage your menu, product images and restock quantities.</p></div><button class="primary" @click="openProduct()"><Plus aria-hidden="true" :size="16"/>Add product</button></div>
   <div class="catalog-toolbar"><label><input v-model="showArchived" type="checkbox"/> Show archived products</label><div class="catalog-links"><NuxtLink to="/admin/finance" class="text-button">Expenses</NuxtLink><NuxtLink to="/admin/history" class="text-button">Change history</NuxtLink></div></div>
   <p v-if="error" class="error" role="alert">{{error}}</p>
   <section v-for="category in [{kind:'bottle',name:'Main products'},{kind:'addon',name:'Add ons'}]" :key="category.kind" class="catalog-section" :aria-label="category.name">
    <div class="section-heading"><h2>{{category.name}}</h2><button v-if="category.kind==='addon'" class="secondary small-action" @click="openProduct(undefined,'addon')"><Plus aria-hidden="true" :size="14"/>Add small product</button></div>
    <div class="catalog-grid">
     <article v-for="product in manager.products.value.filter(p=>p.kind===category.kind&&(showArchived||p.active!==false))" :key="product.id" class="catalog-product" :data-product-id="product.id">
      <div class="catalog-product-heading">
       <div class="catalog-product-image"><img v-if="image(product)" :src="image(product)" :alt="product.name"/><span v-else aria-hidden="true">{{product.name.slice(0,1)}}</span></div>
       <div class="catalog-product-title"><h3>{{product.name}}</h3><p>{{product.size}} · {{money(product.price)}}</p></div>
       <span v-if="product.active===false" class="ops-badge">Archived</span>
      </div>
      <div class="catalog-product-body">
       <div v-if="product.trackStock" class="catalog-stock">
        <strong>{{productStock(product).remaining}} available</strong>
        <span>{{productStock(product).stocked}} restocked · {{productStock(product).reserved}} reserved/sold</span>
       </div><p v-else class="helper">Stock tracking is off.</p>
       <div class="catalog-product-actions"><button class="secondary small-action" :aria-label="`Add stock for ${product.name}`" @click="openStock(product)"><Plus aria-hidden="true" :size="14"/>Add stock</button><button class="text-button" :aria-label="`View restocks for ${product.name}`" @click="viewRestocks(product)">View restocks</button><button class="table-action" :aria-label="`Edit product ${product.name}`" @click="openProduct(product)"><Pencil aria-hidden="true" :size="14"/></button></div>
      </div>
     </article>
    </div>
   </section>
   <section ref="restockLog" class="catalog-section restock-section" aria-labelledby="stock-log-heading" tabindex="-1">
    <div class="section-heading"><div><h2 id="stock-log-heading">Restock log</h2><p class="ops-caption">Restocks and stock adjustments, by product.</p></div></div>
    <div class="restock-toolbar">
     <div><label class="field-label" for="stock-search">Search restocks</label><input id="stock-search" v-model="search" class="input" type="search" placeholder="Product, date or note" maxlength="100"/></div>
     <div><label class="field-label" for="stock-filter">Product</label><NativeSelect id="stock-filter" v-model="filter"><NativeSelectOption value="">All products</NativeSelectOption><NativeSelectOption v-for="p in manager.products.value" :key="p.id" :value="p.id">{{p.name}}</NativeSelectOption></NativeSelect></div>
     <div><label class="field-label" for="stock-page-size">Rows per page</label><NativeSelect id="stock-page-size" v-model="pageSize"><NativeSelectOption v-for="size in [10,20,50,100]" :key="size" :value="String(size)">{{size}}</NativeSelectOption></NativeSelect></div>
    </div>
    <div class="restock-table-card">
     <Table class="restock-table" tabindex="0" role="region" aria-label="Restock history">
      <TableCaption class="sr-only">Restock dates, products, quantities added and notes. Use the row actions to edit or remove an entry.</TableCaption>
      <TableHeader><TableRow><TableHead scope="col" class="restock-date">Date</TableHead><TableHead scope="col">Product</TableHead><TableHead scope="col" class="restock-count">Quantity added</TableHead><TableHead scope="col">Note</TableHead><TableHead scope="col" class="restock-actions"><span class="sr-only">Actions</span></TableHead></TableRow></TableHeader>
      <TableBody>
       <TableRow v-for="row in rows" :key="row.id" class="restock-entry" :data-product-id="row.productId">
        <TableCell class="restock-date"><time :datetime="row.date.slice(0,10)">{{dateLabel(row.date)}}</time></TableCell>
        <TableCell class="restock-product"><strong>{{row.product?.name||entryProduct(row)?.name}}</strong><small>{{row.product?.size||entryProduct(row)?.size}}{{row.kind==='adjustment'?' · Adjustment':''}}</small></TableCell>
        <TableCell class="restock-count"><strong>{{row.quantity>0?'+':''}}{{row.quantity}}</strong><small>{{stockUnit(entryProduct(row),row.quantity)}}</small></TableCell>
        <TableCell class="restock-note">{{row.note||'—'}}</TableCell>
        <TableCell><div class="row-actions"><button class="table-action" :aria-label="`Edit stock entry ${row.date.slice(0,10)} for ${row.product?.name||entryProduct(row)?.name}`" @click="openStock(undefined,row)"><Pencil aria-hidden="true" :size="14"/></button><button class="table-action danger" :aria-label="`Delete stock entry ${row.date.slice(0,10)} for ${row.product?.name||entryProduct(row)?.name}`" @click="formError='';deleting=row"><Trash2 aria-hidden="true" :size="14"/></button></div></TableCell>
       </TableRow>
       <TableRow v-if="!rows.length"><TableCell colspan="5" class="restock-empty"><p>{{search?'No matching restocks.':filter?'No restocks for this product yet.':'No restocks yet.'}}</p></TableCell></TableRow>
      </TableBody>
     </Table>
    </div>
    <div class="transaction-pagination"><p role="status">{{rowStart}}–{{Math.min(page*Number(pageSize),filteredRows.length)}} of {{filteredRows.length}} restocks</p><nav aria-label="Restock pages"><button class="secondary" :disabled="page<=1" @click="page--">Previous</button><span>Page {{page}} of {{pageCount}}</span><button class="secondary" :disabled="page>=pageCount" @click="page++">Next</button></nav></div>
   </section>
   <RecordDialog :open="dialog==='product'" :busy="manager.busy.value" :title="editing?'Edit product':'Add product'" description="Set the menu details, image and inventory rules." @update:open="value=>{if(!value)dialog=null}">
    <form class="record-form" @submit.prevent="saveProduct">
     <label class="field-label" for="product-name">Product name</label><input id="product-name" v-model="form.name" class="input" required maxlength="80" :aria-invalid="!!formError" :aria-describedby="formError?'product-form-error':undefined"/>
     <label class="field-label" for="product-kind">Category</label><NativeSelect id="product-kind" :aria-invalid="!!formError" :aria-describedby="formError?'product-form-error':undefined" v-model="form.kind"><NativeSelectOption value="bottle">Main product</NativeSelectOption><NativeSelectOption value="addon">Add ons</NativeSelectOption></NativeSelect>
     <label class="field-label" for="product-unit">Unit / size</label><input id="product-unit" :aria-invalid="!!formError" :aria-describedby="formError?'product-form-error':undefined" v-model="form.size" class="input" placeholder="500ml, pouch, box…" required maxlength="40"/>
     <label class="field-label" for="product-price">Price (RM)</label><NumberInput id="product-price" :aria-invalid="!!formError" :aria-describedby="formError?'product-form-error':undefined" v-model="form.price" label="product price" :min="0.01" :max="99999.99" :step="0.01" :decimals="2" required/>
     <label class="field-label" for="product-description">Description</label><textarea id="product-description" :aria-invalid="!!formError" :aria-describedby="formError?'product-form-error':undefined" v-model="form.description" class="input order-remarks-input" rows="2" maxlength="300"/>
     <label class="field-label" for="product-spaces">Box spaces per item</label><NumberInput id="product-spaces" :aria-invalid="!!formError" :aria-describedby="formError?'product-form-error':undefined" v-model="form.spaceCost" label="box spaces per item" :min="form.kind==='addon'?0:1" :max="4" required/>
     <label class="catalog-check"><input v-model="form.trackStock" type="checkbox"/>Track stock quantities</label><label class="catalog-check"><input v-model="form.active" type="checkbox"/>Available on the public menu</label>
     <label class="field-label" for="product-order">Display order</label><NumberInput id="product-order" :aria-invalid="!!formError" :aria-describedby="formError?'product-form-error':undefined" v-model="form.sortOrder" label="display order" :min="0" :max="10000"/>
     <label class="field-label" for="product-image">Product image</label><input id="product-image" :aria-invalid="!!formError" :aria-describedby="formError?'product-form-error':undefined" type="file" accept="image/jpeg,image/png,image/webp" :disabled="manager.busy.value" @change="choose"/><img v-if="preview" :src="preview" alt="Product image preview" class="catalog-image-preview"/><p class="helper">Product images are compressed automatically and saved when you save the product.</p>
     <p v-if="formError" id="product-form-error" class="error" role="alert">{{formError}}</p><div class="record-form-actions"><button class="secondary" type="button" @click="dialog=null">Cancel</button><button class="primary" :disabled="manager.busy.value">{{manager.busy.value?'Saving…':'Save product'}}</button></div>
    </form>
   </RecordDialog>
   <RecordDialog :open="dialog==='stock'" :busy="manager.busy.value" :title="stockId?'Edit stock entry':stock.kind==='adjustment'?'Adjust inventory':'Restock product'" description="Choose a product and enter how many bottles or items you are adding." @update:open="value=>{if(!value)dialog=null}"><form class="record-form" @submit.prevent="saveStock">
    <label class="field-label" for="stock-kind">Entry type</label><NativeSelect id="stock-kind" v-model="stock.kind"><NativeSelectOption value="restock">Restock</NativeSelectOption><NativeSelectOption value="adjustment">Adjustment / physical return</NativeSelectOption></NativeSelect>
    <label class="field-label" for="stock-product">Product</label><NativeSelect id="stock-product" :aria-invalid="!!formError" :aria-describedby="formError?'stock-form-error':undefined" v-model="stock.productId" required><NativeSelectOption v-for="p in manager.products.value" :key="p.id" :value="p.id">{{p.name}} · {{p.size}}</NativeSelectOption></NativeSelect>

    <label class="field-label" for="stock-date">Date</label><input id="stock-date" :aria-invalid="!!formError" :aria-describedby="formError?'stock-form-error':undefined" v-model="stock.date" type="date" class="input" :max="malaysiaToday()" required/>
    <label class="field-label" for="stock-quantity">Quantity ({{stockUnit(stockProduct)}})</label><NumberInput id="stock-quantity" :aria-invalid="!!formError" :aria-describedby="formError?'stock-form-error':undefined" v-model="stock.quantity" label="quantity added" :min="stock.kind==='adjustment'?-100000:1" :max="100000" required/>
    <p v-if="stockProduct && stockProduct.trackStock && Number(stock.quantity)!==0&&Number.isFinite(stock.quantity)" class="restock-preview" role="status">{{stockProduct.name}}: {{stockAfterSave}} {{stockUnit(stockProduct,stockAfterSave)}} available after saving.</p>
    <label class="field-label" for="stock-note">{{stock.kind==='adjustment'?'Reason (required)':'Note (optional)'}}</label><textarea id="stock-note" :required="stock.kind==='adjustment'" :minlength="stock.kind==='adjustment'?3:undefined" :aria-invalid="!!formError" :aria-describedby="formError?'stock-form-error':undefined" v-model="stock.note" class="input order-remarks-input" rows="2" maxlength="300"/>
    <p v-if="stock.kind==='adjustment'" class="helper">Use a negative quantity for broken, spoiled or lost bottles. Use a positive quantity only for bottles physically returned to stock. Record the reason.</p>
    <p v-if="formError" id="stock-form-error" class="error" role="alert">{{formError}}</p><div class="record-form-actions"><button class="secondary" type="button" @click="dialog=null">Cancel</button><button class="primary" :disabled="manager.busy.value">Save stock entry</button></div>
   </form></RecordDialog>
   <ConfirmDialog :open="!!deleting" title="Remove this stock entry?" description="Stock will be recalculated. Entries needed for existing orders cannot be removed." confirm-label="Remove entry" :busy="manager.busy.value" :error="formError" @confirm="remove" @update:open="value=>{if(!value)deleting=null}"/>
  </template>
 </div>
</template>
