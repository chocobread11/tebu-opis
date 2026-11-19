import './helpers/disable-telegram.mjs'
import 'dotenv/config'
import assert from 'node:assert/strict'
import {spawn,spawnSync} from 'node:child_process'
import {randomBytes,randomUUID} from 'node:crypto'
import {createServer} from 'node:http'
import {mkdir} from 'node:fs/promises'
import {setTimeout as delay} from 'node:timers/promises'
import pg from 'pg'
import sharp from 'sharp'
import {chromium} from 'playwright'
const name=`tebu_products_test_${Date.now()}`,url=new URL(process.env.NUXT_DATABASE_URL);url.pathname=`/${name}`
const root=new pg.Client({connectionString:process.env.NUXT_DATABASE_URL}),sql=new pg.Client({connectionString:url.toString()})
const base='http://127.0.0.1:3057',key=randomBytes(32).toString('hex')
const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kuala_Lumpur',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())
const objects=new Map()
const storage=createServer(async(req,res)=>{
 assert.ok(req.headers.authorization?.startsWith('AWS4-HMAC-SHA256 '));const path=new URL(req.url,'http://localhost').pathname
 if(req.method==='PUT'){const chunks=[];for await(const chunk of req)chunks.push(chunk);objects.set(path,Buffer.concat(chunks));res.writeHead(200,{ETag:'"fixture"'});res.end()}
 else if(req.method==='GET'&&objects.has(path)){res.writeHead(200,{'Content-Type':'image/webp'});res.end(objects.get(path))}
 else if(req.method==='DELETE'){objects.delete(path);res.writeHead(204);res.end()}
 else{res.writeHead(404);res.end()}
})
await new Promise(resolve=>storage.listen(0,'127.0.0.1',resolve))
const env={...process.env,NUXT_DATABASE_URL:url.toString(),NUXT_ADMIN_KEY:key,NUXT_PUBLIC_DEMO:'false',NUXT_PUBLIC_TESTING_CALENDAR:'true',NUXT_SITE_URL:'',NUXT_PUBLIC_DUITNOW_QR:'/favicon.svg',NUXT_UPLOAD_STORAGE:'r2',NUXT_R2_ENDPOINT:`http://127.0.0.1:${storage.address().port}`,NUXT_R2_ACCOUNT_ID:'',NUXT_R2_ACCESS_KEY_ID:'fixture-access',NUXT_R2_SECRET_ACCESS_KEY:'fixture-secret',NUXT_R2_BUCKET:'test-bucket',NUXT_R2_PREFIX:'tebu/media',NITRO_HOST:'127.0.0.1',NITRO_PORT:'3057',NODE_ENV:'development'}
const request=async(path,{body,token=key,method,...opts}={})=>{const response=await fetch(base+path,{...opts,method:method||(body?'POST':'GET'),headers:{...(token?{Authorization:`Bearer ${token}`} :{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});return {status:response.status,data:await response.json()}}
const main={name:'Ginger Cooler',size:'330ml',description:'Fresh ginger menu.',kind:'bottle',price:850,spaceCost:2,trackStock:true,varietyTracked:false,active:true,sortOrder:4}
const condiment={...main,name:'Mint pouch',kind:'addon',size:'pouch',price:150,spaceCost:0,sortOrder:5}
let server,browser,created=false,output='',debugPage
try{
 await root.connect();await root.query(`CREATE DATABASE "${name}"`);created=true
 const migrated=spawnSync('bun',['prisma','migrate','deploy'],{env,encoding:'utf8'});assert.equal(migrated.status,0,migrated.stderr)
 await sql.connect();await sql.query('INSERT INTO schedules(id) VALUES($1)',[today]);await sql.query("WITH history AS (INSERT INTO harvests(date,quantity,type,variety_id,kecik_qty,besar_qty) VALUES($1,10,'Earlier Tebu','tebu-1',20,10) RETURNING id) INSERT INTO stock_entries(product_id,date,quantity,note,source_harvest_id) SELECT 'kecik',$1,20,'Earlier harvest',id FROM history",[today])
 server=spawn(process.execPath,['.output/server/index.mjs'],{env,stdio:['ignore','pipe','pipe']});server.stdout.on('data',chunk=>output+=chunk);server.stderr.on('data',chunk=>output+=chunk)
 let ready=false;for(let i=0;i<100;i++){try{if((await fetch(base+'/api/health')).ok){ready=true;break}}catch{}await delay(100)}assert.ok(ready,output)
 assert.equal((await request('/api/admin/settings',{token:''})).status,401)
 assert.equal((await request('/api/admin/settings',{token:'',method:'PUT',body:{whatsappOpening:'Hello'}})).status,401)
 assert.equal((await request('/api/admin/settings',{method:'PUT',body:{whatsappOpening:' '}})).status,400)
 assert.equal((await request('/api/admin/settings',{method:'PUT',body:{whatsappOpening:'Hello',ticketUrl:'https://changed.example'}})).status,400)
 assert.equal((await request('/api/admin/settings',{method:'PUT',body:{whatsappOpening:'Hello {name}, order {tag} is ready.'}})).status,200)
 assert.equal((await request('/api/admin/settings')).data.whatsappOpening,'Hello {name}, order {tag} is ready.')
 assert.equal((await request('/api/admin/products',{token:''})).status,401);assert.equal((await request('/api/admin/stock',{token:''})).status,401)
 const a=await request('/api/admin/products',{body:main}),b=await request('/api/admin/products',{body:condiment});assert.equal(a.status,200,JSON.stringify(a));assert.equal(b.status,200);const product=a.data,addon=b.data
 assert.equal((await request('/api/admin/products',{body:{...main,spaceCost:0}})).status,400)
 const catalog=async()=> (await request('/api/catalog',{token:''})).data
 assert.equal((await catalog()).products.find(p=>p.id===product.id).stocks[0].remaining,0)
 const identity=await request('/api/identity',{token:'',body:{phone:'0129990077',name:'Dynamic Buyer'}});assert.equal(identity.status,200)
 const buy=(cart,requestId=randomUUID(),scheduleId=today)=>request('/api/orders',{token:identity.data.token,body:{requestId,scheduleId,cart}})
 assert.equal((await buy({[product.id]:1})).status,409,'New products need stock before selling')
 const addStock=(id,quantity)=>request('/api/admin/stock',{body:{productId:id,date:today,quantity,note:'Product-linked harvest batch'}})
 const first=await addStock(product.id,5);assert.equal(first.status,200)
 assert.equal((await addStock(addon.id,3)).status,200)
 const extra=await addStock(product.id,10);assert.equal(extra.status,200)
 const historical=(await request('/api/admin/stock')).data.entries.find(row=>row.sourceHarvestId);assert.ok(historical);assert.equal((await request(`/api/admin/stock/${historical.id}`,{method:'PATCH',body:{productId:'kecik',date:today,quantity:21,note:'Corrected opening stock'}})).status,200);assert.equal((await request('/api/admin/logs/harvests',{body:{}})).status,410)
 const cart={[product.id]:2,[addon.id]:1},sale=await buy(cart);assert.equal(sale.status,200,JSON.stringify(sale));assert.equal(sale.data.total,1850);assert.equal(sale.data.items[0].name,'Ginger Cooler')
 let current=await catalog();assert.equal(current.products.find(p=>p.id===product.id).stocks[0].remaining,13);assert.equal(current.products.find(p=>p.id===addon.id).stocks[0].remaining,2);assert.equal(current.days.find(d=>d.id===today).remaining,8)
 assert.equal((await buy({[product.id]:1,[addon.id]:3})).status,409,'Condiment stock is enforced too')
 assert.equal((await buy({[addon.id]:1})).status,400,'Main product required')
 assert.equal((await buy({'unknown-menu':1})).status,409)
 const race=await Promise.all([buy({[product.id]:4}),buy({[product.id]:4})]);assert.deepEqual(race.map(r=>r.status).sort(),[200,409]);assert.equal((await request(`/api/admin/orders/${race.find(r=>r.status===200).data.token}`,{method:'DELETE'})).status,200)
 const changed={...main,name:'Renamed Ginger',price:990,spaceCost:3};assert.equal((await request(`/api/admin/products/${product.id}`,{method:'PATCH',body:changed})).status,200)
 const receipt=(await request(`/api/orders/${sale.data.token}`,{token:''})).data;assert.equal(receipt.items[0].name,'Ginger Cooler');assert.equal(receipt.total,1850);assert.equal(receipt.items[0].spaceCost,2);assert.equal((await catalog()).days.find(d=>d.id===today).remaining,8)
 const edited=await request(`/api/admin/orders/${sale.data.token}`,{method:'PATCH',body:{name:'Dynamic Buyer',scheduleId:today,status:'confirmed',cart:{[product.id]:3,[addon.id]:1}}});assert.equal(edited.status,200,JSON.stringify(edited));assert.equal(edited.data.order.total,2700);assert.equal(edited.data.order.items[0].spaceCost,2)
 await sql.query('UPDATE orders SET packed=true WHERE token=$1',[sale.data.token])
 const preservePacked=await request(`/api/admin/orders/${sale.data.token}`,{method:'PATCH',body:{name:'Dynamic Buyer',scheduleId:today,status:'confirmed',remarks:'Only a note changed',cart:{[product.id]:3,[addon.id]:1,kecik:0,besar:0,asam:0,limau:0}}})
 assert.equal(preservePacked.status,200);assert.equal(preservePacked.data.order.packed,true,'Adding omitted zero quantities must not reset packing')
 const removeLine=await request(`/api/admin/orders/${sale.data.token}`,{method:'PATCH',body:{name:'Dynamic Buyer',scheduleId:today,status:'confirmed',cart:{[product.id]:3}}})
 assert.equal(removeLine.status,200);assert.equal(removeLine.data.order.packed,false,'Removing a line must reset packing')

 assert.equal((await request(`/api/admin/stock/${extra.data.id}`,{method:'DELETE'})).status,200)
 assert.equal((await request(`/api/admin/stock/${first.data.id}`,{method:'DELETE'})).status,409,'Restock needed for sold items cannot be deleted')
 assert.equal((await request(`/api/admin/stock/${first.data.id}`,{method:'PATCH',body:{productId:product.id,date:today,quantity:1,note:''}})).status,409,'Reducing stock below sales rolls back')
 const image=await sharp(randomBytes(600*600*3),{raw:{width:600,height:600,channels:3}}).jpeg({quality:35}).toBuffer();assert.ok(image.length>16000&&image.length<250000)
 const form=new FormData();form.set('file',new Blob([image],{type:'image/jpeg'}),'menu.jpg')
 let response=await fetch(base+`/api/admin/products/${product.id}/image`,{method:'POST',headers:{Authorization:`Bearer ${key}`},body:form});assert.equal(response.status,200);const media=await response.json()
 assert.ok([...objects.keys()].some(key=>key.startsWith('/test-bucket/tebu/media/products/')))
 const publishedPhoto=await fetch(base+media.url);assert.ok(publishedPhoto.ok);assert.equal(publishedPhoto.headers.get('cache-control'),'public, max-age=86400, immutable')
 const privatePhoto=await fetch(base+media.url,{headers:{Authorization:`Bearer ${key}`}});assert.equal(privatePhoto.headers.get('cache-control'),'no-store')
 const firstPage=await (await fetch(base)).text();assert.ok(firstPage.includes(`src="${media.url}"`),'Product image URLs are present before client JavaScript runs');assert.match(firstPage, /rel="preload"[^>]*as="image"|as="image"[^>]*rel="preload"/)
 assert.equal((await request(`/api/admin/products/${product.id}`,{method:'PATCH',body:{...changed,active:false}})).status,200);assert.equal((await fetch(base+media.url)).status,404);assert.ok((await fetch(base+media.url,{headers:{Authorization:`Bearer ${key}`}})).ok)
 assert.equal((await buy({[product.id]:1})).status,409)
 await request(`/api/admin/products/${product.id}`,{method:'PATCH',body:changed})
 const dates=[1,2].map(offset=>{const date=new Date(`${today}T00:00:00Z`);date.setUTCDate(date.getUTCDate()+offset);return date.toISOString().slice(0,10)})
 for(const date of dates)await sql.query('INSERT INTO schedules(id) VALUES($1) ON CONFLICT DO NOTHING',[date])
 const sharedRace=await Promise.all(dates.map(date=>buy({[product.id]:2},randomUUID(),date)))
 assert.deepEqual(sharedRace.map(row=>row.status).sort(),[200,409],'Shared product stock cannot be sold twice across delivery dates')
 await request(`/api/admin/orders/${sharedRace.find(row=>row.status===200).data.token}`,{method:'DELETE'})

 // The four products share delivery capacity, while each has independent stock.
 const tebuIds=['kecik','besar','tebu-2-kecik','tebu-2-besar']
 for(const id of tebuIds)assert.equal((await addStock(id,2)).status,200)
 const before=await catalog();assert.ok(tebuIds.every(id=>before.products.find(p=>p.id===id)?.varietyTracked===false))
 const mix=await buy(Object.fromEntries(tebuIds.map(id=>[id,1])),randomUUID(),dates[0]);assert.equal(mix.status,200,JSON.stringify(mix));assert.equal(mix.data.items.length,4);assert.equal(mix.data.total,3400);assert.equal(mix.data.varietyId,undefined)
 const afterMix=await catalog();for(const id of tebuIds)assert.equal(afterMix.products.find(p=>p.id===id).stocks[0].remaining,before.products.find(p=>p.id===id).stocks[0].remaining-1)
 assert.equal(afterMix.days.find(d=>d.id===dates[0]).remaining,6)
 assert.equal((await request(`/api/admin/orders/${mix.data.token}`,{method:'DELETE'})).status,200)
 await sql.query("INSERT INTO stock_entries(product_id,date,quantity,note) SELECT $1,$2::date,1,'Search batch ' || n FROM generate_series(1,22) n",[product.id,today])
 console.log('PASS API: dynamic main products and condiments, product stock, shared daily capacity, concurrency, historical snapshots, safe restock edits, archiving and R2 product image uploads over 16 KB.')
 browser=await chromium.launch({headless:true});await mkdir('test-results',{recursive:true})
 const page=await browser.newPage({viewport:{width:1440,height:1000},extraHTTPHeaders:{'X-Forwarded-For':'127.0.0.35'}});debugPage=page;page.setDefaultTimeout(15000)
 await page.goto(base+'/admin/products',{waitUntil:'networkidle'});await page.getByLabel('Admin key',{exact:true}).fill(key);await page.getByRole('button',{name:'Open pantry ops',exact:true}).click()
 await page.getByRole('heading',{name:'Products & inventory',exact:true}).waitFor()
 await page.getByRole('button',{name:'Edit product Tebu 1 · Kecik',exact:true}).click()
 await page.locator('.catalog-image-preview').waitFor();assert.equal(await page.locator('.catalog-image-preview').getAttribute('src'),'/images/storefront/kecik.webp')
 await page.getByRole('button',{name:'Cancel',exact:true}).click()
 await page.getByRole('button',{name:'Add product',exact:true}).click()
 await page.getByLabel('Product name',{exact:true}).fill('Seasonal Special');await page.getByLabel('Unit / size',{exact:true}).fill('box');await page.locator('#product-price').fill('7.50')
 const uiImage=await sharp({create:{width:400,height:400,channels:3,background:'#d4dfb1'}}).png().toBuffer()
 await page.getByLabel('Product image',{exact:true}).setInputFiles({name:'seasonal.png',mimeType:'image/png',buffer:uiImage})
 await page.locator('.catalog-image-preview').waitFor()
 const savedResponse=page.waitForResponse(r=>r.url()===base+'/api/admin/products'&&r.request().method()==='POST')
 await page.getByRole('button',{name:'Save product',exact:true}).click();const newProduct=await (await savedResponse).json()
 const card=page.locator(`.catalog-product[data-product-id="${newProduct.id}"]`);await card.waitFor();assert.equal(await card.locator('img').evaluate(img=>img.complete&&img.naturalWidth>0),true)
 await card.getByRole('button',{name:'Edit product Seasonal Special',exact:true}).click()
 await page.locator('.catalog-image-preview').waitFor();assert.ok((await page.locator('.catalog-image-preview').getAttribute('src')).startsWith('/api/media/'))
 await page.waitForFunction(()=>{const img=document.querySelector('.catalog-image-preview');return img?.complete&&img?.naturalWidth>0})
 await page.getByRole('button',{name:'Cancel',exact:true}).click()
 await card.getByRole('button',{name:/^Add stock for /}).click();await page.locator('#stock-quantity').fill('4');await page.locator('#stock-note').fill('Fresh menu ready');await page.getByRole('button',{name:'Save stock entry',exact:true}).click()
 await page.waitForFunction(id=>document.querySelector(`[data-product-id="${id}"] .catalog-stock`)?.textContent?.includes('4 available'),newProduct.id)
 await card.getByRole('button',{name:'View restocks for Seasonal Special',exact:true}).click()
 assert.equal(await page.locator('#stock-filter').inputValue(),newProduct.id)
 const stockLog=page.locator('.restock-section');assert.equal(await stockLog.locator('.section-heading button').count(),0);assert.equal(await stockLog.locator('.restock-entry').count(),1)
 assert.ok((await stockLog.innerText()).includes('+4'));assert.ok((await stockLog.innerText()).includes('items'))
 assert.equal(await page.locator('#stock-filter option').filter({hasText:'Seasonal Special'}).count(),1)
 await page.locator('#stock-filter').selectOption('')
 assert.ok((await stockLog.locator('.restock-entry').count())>1)
 assert.equal(await stockLog.getByText(/kg cane/).count(),0)
 const bottleCard=page.locator('.catalog-product[data-product-id="tebu-2-kecik"]')
 await bottleCard.getByRole('button',{name:/^Add stock for /}).click()
 await page.getByLabel('Quantity (bottles)',{exact:true}).fill('3');await page.locator('#stock-note').fill('Bottles ready')
 assert.ok((await page.locator('.restock-preview').innerText()).includes('5 bottles available after saving'))
 assert.equal(await page.getByRole('dialog').getByText(/kg|harvest/i).count(),0)
 await page.getByRole('button',{name:'Save stock entry',exact:true}).click()
 await page.waitForFunction(()=>document.querySelector('.catalog-product[data-product-id="tebu-2-kecik"] .catalog-stock')?.textContent?.includes('5 available'))
 await bottleCard.getByRole('button',{name:'View restocks for Tebu 2 · Kecik',exact:true}).click()
 const bottleEntry=stockLog.locator('.restock-entry').filter({hasText:'Bottles ready'});assert.ok((await bottleEntry.innerText()).includes('+3'));assert.ok((await bottleEntry.innerText()).includes('bottles'))
 // Editing a dated row updates the log and inventory by the difference.
 assert.equal(await stockLog.getByRole('columnheader',{name:'Date',exact:true}).count(),1)
 await bottleEntry.getByRole('button',{name:/^Edit stock entry/}).click()
 const earlier=new Date(`${today}T00:00:00Z`);earlier.setUTCDate(earlier.getUTCDate()-1);const restockDate=earlier.toISOString().slice(0,10)
 await page.locator('#stock-date').fill(restockDate);await page.locator('#stock-quantity').fill('4');await page.locator('#stock-note').fill('Corrected bottle restock')
 await page.getByRole('button',{name:'Save stock entry',exact:true}).click()
 await page.waitForFunction(()=>document.querySelector('.catalog-product[data-product-id="tebu-2-kecik"] .catalog-stock')?.textContent?.includes('6 available'))
 const editedRow=stockLog.getByRole('row').filter({hasText:'Corrected bottle restock'});await editedRow.waitFor();assert.equal(await editedRow.locator('time').getAttribute('datetime'),restockDate);assert.ok((await editedRow.innerText()).includes('+4'))
 assert.equal((await sql.query("SELECT quantity FROM stock_entries WHERE product_id='tebu-2-kecik' AND note='Corrected bottle restock'")).rows[0].quantity,4)
 await page.locator('#stock-filter').selectOption('')
 await page.locator('#stock-search').fill('Search batch');assert.equal(await stockLog.locator('.restock-entry').count(),10)
 const pagination=stockLog.getByRole('navigation',{name:'Restock pages',exact:true});await pagination.getByRole('button',{name:'Next',exact:true}).click();assert.ok((await pagination.innerText()).includes('Page 2 of 3'))
 await pagination.getByRole('button',{name:'Next',exact:true}).click();assert.equal(await stockLog.locator('.restock-entry').count(),2)
 await page.locator('#stock-page-size').selectOption('20');assert.equal(await stockLog.locator('.restock-entry').count(),20);assert.ok((await pagination.innerText()).includes('Page 1 of 2'))
 await page.locator('#stock-search').fill('no matching restock');assert.equal(await stockLog.locator('.restock-entry').count(),0);assert.ok(await pagination.getByRole('button',{name:'Next',exact:true}).isDisabled())
 await page.locator('#stock-search').fill('');await page.locator('#stock-page-size').selectOption('10')
 for(const width of [320,390,1440]){await page.setViewportSize({width,height:1000});const expenseLink=await page.getByRole('link',{name:'Expenses',exact:true}).boundingBox(),historyLink=await page.getByRole('link',{name:'Change history',exact:true}).boundingBox();assert.ok(historyLink.x-expenseLink.x-expenseLink.width>=8);assert.ok(expenseLink.height>=44&&historyLink.height>=44);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await stockLog.evaluate(element=>element.scrollIntoView({block:'start'}));await page.screenshot({path:`test-results/restock-log-${width}.png`});await page.locator('.app-content').evaluate(element=>element.scrollTop=0);await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));await page.screenshot({path:`test-results/products-inventory-${width}.png`})}
 await page.getByRole('link',{name:'Expenses',exact:true}).click();await page.getByRole('button',{name:'Add expense',exact:true}).waitFor();assert.equal(await page.locator('.log-section').count(),0);assert.equal(await page.getByText(/kg cane|Earlier harvests/).count(),0)
 await page.getByRole('button',{name:'Add expense',exact:true}).click();await page.getByLabel('Amount (RM)',{exact:true}).fill('12.50');await page.getByLabel('Note optional',{exact:true}).fill('Inventory flow expense');await page.getByRole('dialog').getByRole('button',{name:'Add expense',exact:true}).click();await page.locator('tbody').getByRole('cell',{name:'RM 12.50',exact:true}).waitFor()
 await page.getByRole('button',{name:/^Edit expense/}).click();await page.getByLabel('Amount (RM)',{exact:true}).fill('15.25');await page.getByRole('button',{name:'Save changes',exact:true}).click();await page.locator('tbody').getByRole('cell',{name:'RM 15.25',exact:true}).waitFor();assert.equal((await sql.query("SELECT amount FROM expenses WHERE note='Inventory flow expense'")).rows[0].amount,1525)
 await page.getByRole('button',{name:/^Delete expense/}).click();await page.getByRole('button',{name:'Keep record',exact:true}).click();await page.getByRole('button',{name:/^Delete expense/}).click();await page.getByRole('button',{name:'Delete record',exact:true}).click();await page.getByText('No expenses yet.',{exact:true}).waitFor()
 await page.getByRole('link',{name:'Calendar',exact:true}).click()
 await page.getByRole('link',{name:'Settings',exact:true}).click();await page.getByLabel('Message opening',{exact:true}).fill('Salam {name}! Your order {tag} is ready for pickup.')
 const saveTemplate=page.waitForResponse(r=>r.url()===base+'/api/admin/settings'&&r.request().method()==='PUT')
 await page.getByRole('button',{name:'Save changes',exact:true}).click();assert.equal((await saveTemplate).status(),200)
 assert.equal((await request('/api/admin/settings')).data.whatsappOpening,'Salam {name}! Your order {tag} is ready for pickup.')
 await page.getByRole('link',{name:'Calendar',exact:true}).click()
 const message=page.getByRole('link',{name:/WhatsApp ticket .* for Dynamic Buyer/});await message.waitFor();const text=new URL(await message.getAttribute('href')).searchParams.get('text');assert.ok(text.startsWith('Salam Dynamic Buyer!'));assert.ok(text.endsWith(base+'/drop?t='+sale.data.token))
 await page.getByRole('button',{name:'Add order',exact:true}).click()
 await page.locator('#manual-name').fill('Manual seasonal buyer');await page.locator('#manual-date').fill(today);await page.locator(`#manual-${newProduct.id}`).fill('1')
 await page.getByRole('button',{name:'Save order',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'})
 assert.equal((await sql.query("SELECT bottles FROM orders WHERE customer_name='Manual seasonal buyer'")).rows[0].bottles,1)
 const storefront=await browser.newPage({viewport:{width:390,height:900},extraHTTPHeaders:{'X-Forwarded-For':'127.0.0.36'}});debugPage=storefront;storefront.setDefaultTimeout(15000)
 await storefront.goto(base,{waitUntil:'networkidle'});
 assert.equal(await storefront.getByRole('group',{name:'Sugarcane variety'}).count(),0)
 const soldProduct=await request('/api/admin/products',{body:{...main,name:'Sold Out Special',spaceCost:1}});assert.equal(soldProduct.status,200)
 await storefront.reload({waitUntil:'networkidle'})
 const soldCard=storefront.locator(`[data-product-id="${soldProduct.data.id}"]`);assert.ok((await soldCard.innerText()).includes('Sold out'));assert.equal(await soldCard.getByRole('button',{name:'Add Sold Out Special',exact:true}).isDisabled(),true);await soldCard.screenshot({path:'test-results/four-products-sold-out.png'})
 assert.equal((await addStock(soldProduct.data.id,1)).status,200);await storefront.reload({waitUntil:'networkidle'});assert.equal(await soldCard.getByRole('button',{name:'Add Sold Out Special',exact:true}).isEnabled(),true)
 await storefront.getByRole('button',{name:'Add Seasonal Special',exact:true}).click()
 assert.ok((await storefront.locator('.order-item').filter({hasText:'Seasonal Special'}).innerText()).includes('RM 7.50'))
 await storefront.getByRole('button',{name:'LOCK MY BOTTLE',exact:true}).click();await storefront.getByLabel('Malaysian mobile number').fill('0129990078');await storefront.getByLabel('What should we write on your bag?',{exact:true}).fill('Seasonal Buyer')
 await storefront.getByRole('button',{name:'Continue to payment',exact:true}).click();await storefront.getByRole('heading',{name:'Pay with DuitNow QR',exact:true}).waitFor();assert.ok((await storefront.locator('.amount-copy').innerText()).includes('RM 7.50'))
 assert.equal((await catalog()).products.find(p=>p.id===newProduct.id).stocks[0].remaining,2)
 console.log('PASS UI: create a product and upload its R2 image, log stock, show main/condiment sections without overflow at 390/1440px, and buy the new menu from the customer checkout without code changes.')
}catch(error){if(debugPage&&!debugPage.isClosed())await debugPage.screenshot({path:'test-results/products-inventory-failure.png',fullPage:true}).catch(()=>{});throw error}
finally{await browser?.close();if(server&&server.exitCode===null&&server.signalCode===null){const exit=new Promise(resolve=>server.once('exit',resolve));server.kill('SIGTERM');await exit}await sql.end().catch(()=>{});if(created)await root.query(`DROP DATABASE "${name}" WITH (FORCE)`);await root.end();await new Promise(resolve=>storage.close(resolve))}
