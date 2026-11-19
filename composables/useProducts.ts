import { demoInventory } from '~/shared/demo-inventory'
import { products as defaults, demoVarieties, malaysiaToday, type Product } from '~/shared/domain'
export type StockRecord = { id: string; productId: string; kind?: 'restock'|'adjustment'; varietyId?: string | null; date: string; quantity: number; note: string; sourceHarvestId?: string | null; product?: { name: string; size: string }; variety?: { name: string } | null }
export function useProducts() {
  const admin=useAdmin(), shop=useShop()
  const products=useState<Product[]>('admin-product-catalog',()=>[]), entries=useState<StockRecord[]>('admin-stock-records',()=>[])
  const busy=useState('admin-products-busy',()=>false)
  function persist() { localStorage.setItem('tebu_demo_products',JSON.stringify(products.value)); localStorage.setItem('tebu_demo_stock',JSON.stringify(entries.value)); shop.catalog.value=products.value.filter(p=>p.active!==false) }
  async function load() {
    if (!admin.local) {
      const [catalog,stock]=await Promise.all([$fetch<{ products:Product[] }>('/api/admin/products',{headers:admin.headers.value}),$fetch<{ entries:StockRecord[] }>('/api/admin/stock',{headers:admin.headers.value})])
      products.value=catalog.products; entries.value=stock.entries
    } else {
      const current = demoInventory(JSON.parse(localStorage.getItem('tebu_demo_products') || 'null'), JSON.parse(localStorage.getItem('tebu_demo_stock') || '[]'), shop.tickets.value)
      products.value = current.products; entries.value = current.entries
      persist()
    }
  }
  async function saveProduct(input:Omit<Product,'id'>,id?:string) {
    if(admin.local){ const product={...input,id:id||crypto.randomUUID()}; const index=products.value.findIndex(p=>p.id===id);if(index<0)products.value.push(product);else products.value[index]={...products.value[index],...product};persist();return product }
    return id?await $fetch<Product>(`/api/admin/products/${id}`,{method:'PATCH',headers:admin.headers.value,body:input}):await $fetch<Product>('/api/admin/products',{method:'POST',headers:admin.headers.value,body:input})
  }
  async function saveStock(input:Omit<StockRecord,'id'>,id?:string) {
    if(!Number.isInteger(input.quantity)||(input.kind==='adjustment'?(input.quantity===0||input.note.trim().length<3):input.quantity<=0))throw new Error('Enter a valid quantity. Adjustments need a reason.')
    if(admin.local){const previous=entries.value.map(row=>({...row}));const index=entries.value.findIndex(row=>row.id===id);const row={...input,id:id||crypto.randomUUID()};if(index<0)entries.value.push(row);else entries.value[index]=row;persist();await load();if(products.value.some(p=>p.trackStock&&p.stocks?.some(s=>s.remaining<0))){entries.value=previous;persist();await load();throw new Error('Keep enough stock for existing orders.')}return}
    if(id)await $fetch(`/api/admin/stock/${id}`,{method:'PATCH',headers:admin.headers.value,body:input});else await $fetch('/api/admin/stock',{method:'POST',headers:admin.headers.value,body:input})
  }
  async function removeStock(id:string) {
    if(admin.local){const previous=[...entries.value];entries.value=entries.value.filter(row=>row.id!==id);persist();await load();if(products.value.some(p=>p.trackStock&&p.stocks?.some(s=>s.remaining<0))){entries.value=previous;persist();await load();throw new Error('This stock is needed for existing orders.')}return}
    await $fetch(`/api/admin/stock/${id}`,{method:'DELETE',headers:admin.headers.value})
  }
  return {products,entries,busy,load,saveProduct,saveStock,removeStock,persist}
}
