import './helpers/disable-telegram.mjs'
import 'dotenv/config'
import assert from 'node:assert/strict'
import {spawn,spawnSync} from 'node:child_process'
import {randomBytes,randomUUID} from 'node:crypto'
import {mkdtemp,writeFile,rm,mkdir} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {setTimeout as delay} from 'node:timers/promises'
import pg from 'pg'
import sharp from 'sharp'
import {chromium} from 'playwright'

const name=`tebu_recovery_test_${Date.now()}`,url=new URL(process.env.NUXT_DATABASE_URL);url.pathname=`/${name}`
const root=new pg.Client({connectionString:process.env.NUXT_DATABASE_URL}),sql=new pg.Client({connectionString:url.toString()})
const uploads=await mkdtemp(join(tmpdir(),'tebu-flow-audit-')),key=randomBytes(32).toString('hex'),base='http://127.0.0.1:3062'
const env={...process.env,NUXT_DATABASE_URL:url.toString(),NUXT_ADMIN_KEY:key,NUXT_PUBLIC_DEMO:'false',NUXT_PUBLIC_TESTING_CALENDAR:'true',NUXT_PUBLIC_DUITNOW_QR:'/favicon.svg',NUXT_UPLOAD_STORAGE:'local',NUXT_UPLOAD_DIR:uploads,NUXT_SITE_URL:'',NITRO_HOST:'127.0.0.1',NITRO_PORT:'3062',NODE_ENV:'development'}
const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kuala_Lumpur',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())
const dates=Array.from({length:5},(_,i)=>{const d=new Date(`${today}T00:00:00Z`);d.setUTCDate(d.getUTCDate()+i);return d.toISOString().slice(0,10)})
const findings={}
await mkdir('test-results/recovery-flows',{recursive:true})
let server,browser,created=false,output=''
const call=async(path,{body,token=key,method,...options}={})=>{const r=await fetch(base+path,{...options,method:method||(body?'POST':'GET'),headers:{'X-Forwarded-For':'127.0.0.90',...(token?{Authorization:`Bearer ${token}`} :{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});return{status:r.status,data:await r.json()}}
const image=await sharp({create:{width:100,height:100,channels:3,background:'#ddd'}}).png().toBuffer()
async function upload(token,fields){const form=new FormData();form.set('file',new Blob([image],{type:'image/png'}),'audit.png');for(const [k,v]of Object.entries(fields))form.set(k,v);const r=await fetch(base+'/api/uploads',{method:'POST',headers:{Authorization:`Bearer ${token}`,'X-Forwarded-For':'127.0.0.90'},body:form});return{status:r.status,data:await r.json()}}
async function reviewed(customer,date=today,cart={kecik:1}){const sale=await call('/api/orders',{token:customer,body:{requestId:randomUUID(),scheduleId:date,cart}});assert.equal(sale.status,200,JSON.stringify(sale.data));const receipt=await upload(customer,{orderToken:sale.data.token});assert.equal(receipt.status,200);const submit=await call(`/api/orders/${sale.data.token}`,{token:customer,method:'PATCH',body:{action:'receipt',receiptId:receipt.data.id}});assert.equal(submit.data.status,'pending_review');assert.equal((await call(`/api/media/${receipt.data.id}`,{token:''})).status,401);return sale.data}
const catalog=async()=> (await call('/api/catalog',{token:''})).data
const stock=async id=>(await catalog()).products.find(p=>p.id===id).stocks[0].remaining
async function begin(page,phone,customerName){await page.goto(base,{waitUntil:'networkidle'});await page.getByRole('button',{name:'Add Tebu 1 · Kecik',exact:true}).click();await page.getByRole('button',{name:'LOCK MY BOTTLE',exact:true}).click();await page.getByLabel('Malaysian mobile number').fill(phone);await page.getByLabel('What should we write on your bag?',{exact:true}).fill(customerName)}
try{
 await root.connect();await root.query(`CREATE DATABASE "${name}"`);created=true
 const migration=spawnSync('bun',['prisma','migrate','deploy'],{env,encoding:'utf8'});assert.equal(migration.status,0,migration.stderr)
 await sql.connect();for(const d of dates)await sql.query('INSERT INTO schedules(id,capacity) VALUES($1,100)',[d])
 await sql.query("INSERT INTO stock_entries(product_id,date,quantity,note) SELECT id,$1,100,'Audit opening stock' FROM products WHERE kind='bottle'",[today])
 server=spawn(process.execPath,['.output/server/index.mjs'],{env,stdio:['ignore','pipe','pipe']});server.stdout.on('data',b=>output+=b);server.stderr.on('data',b=>output+=b)
 let ready=false;for(let i=0;i<100;i++){try{if((await fetch(base+'/api/health')).ok){ready=true;break}}catch{}await delay(100)}assert.ok(ready,output)
 const identity=await call('/api/identity',{token:'',body:{phone:'0129990090',name:'Audit Buyer'}});assert.equal(identity.status,200);const token=identity.data.token
 const a=await reviewed(token,today,{kecik:1,'tebu-2-besar':1,asam:1});assert.equal(a.total,1800)
 const late=await reviewed(token)
 const unpaid=await call('/api/admin/orders',{body:{requestId:randomUUID(),name:'Unpaid Manual',scheduleId:today,paymentStatus:'unpaid',cart:{kecik:1}}});assert.equal(unpaid.status,200)
 for(const [t,approve]of [[a.token,true],[unpaid.data.token,false]]){if(approve)assert.equal((await call('/api/admin',{method:'PATCH',body:{action:'approve',orderToken:t}})).status,200);assert.equal((await call('/api/admin',{method:'PATCH',body:{action:'pack',orderToken:t,packed:true}})).status,200)}
 const photo=await upload(key,{scheduleId:today});assert.equal(photo.status,200)
 assert.equal((await call('/api/admin',{method:'PATCH',body:{action:'drop',scheduleId:today,photoId:photo.data.id}})).status,200)
 assert.equal((await call(`/api/orders/${a.token}`,{token:''})).data.status,'ready')
 assert.equal((await call(`/api/orders/${a.token}`,{token:'',method:'PATCH',body:{action:'collect'}})).data.status,'collected')
 findings.happyPath='PASS: mixed-product order → private receipt → review → approval → packing → photo → ready → customer collection'
 findings.unpaidManualAfterDrop=(await call(`/api/orders/${unpaid.data.token}`,{token:''})).data.status
 await call('/api/admin',{method:'PATCH',body:{action:'approve',orderToken:late.token}});await call('/api/admin',{method:'PATCH',body:{action:'pack',orderToken:late.token,packed:true}})
 browser=await chromium.launch({headless:true})
 const admin=await browser.newPage({viewport:{width:1440,height:1000},extraHTTPHeaders:{'X-Forwarded-For':'127.0.0.91'}});admin.setDefaultTimeout(15000)
 await admin.goto(base+'/admin',{waitUntil:'networkidle'});await admin.getByLabel('Admin key',{exact:true}).fill(key);await admin.getByRole('button',{name:'Open pantry ops',exact:true}).click();await admin.getByRole('button',{name:'2. Pantry drop',exact:true}).click();await admin.locator('.admin-photo img').waitFor();await admin.locator('.inner-page[aria-busy="false"]').waitFor()
 findings.lateApprovalAfterDrop={status:(await call(`/api/orders/${late.token}`,{token:''})).data.status,hasPublishedPhoto:await admin.locator('.admin-photo img').count()>0,readyButtonDisabled:await admin.getByRole('button',{name:'Mark packed bags ready for pickup',exact:true}).isDisabled()}
 assert.equal(findings.lateApprovalAfterDrop.readyButtonDisabled,false)
 assert.equal((await call('/api/admin',{method:'PATCH',body:{action:'drop',scheduleId:today,photoId:photo.data.id}})).status,200)
 assert.equal((await call(`/api/orders/${late.token}`,{token:''})).data.status,'ready')
 await admin.screenshot({path:'test-results/recovery-flows/late-approval.png'})
 const stockBefore=await stock('kecik'),revenueBefore=(await call('/api/admin/logs')).data.revenue
 const rejected=await call(`/api/admin/orders/${a.token}/payment`,{method:'PATCH',body:{paymentStatus:'rejected',expectedStatus:'collected',expectedPaymentStatus:'paid'}});assert.equal(rejected.status,409)
 findings.rejectCollected={stockBefore,stockAfter:await stock('kecik'),revenueBefore,revenueAfter:(await call('/api/admin/logs')).data.revenue}
 assert.equal(findings.rejectCollected.stockAfter,stockBefore);assert.equal(findings.rejectCollected.revenueAfter,revenueBefore)
 assert.equal((await call(`/api/admin/orders/${a.token}`,{method:'DELETE'})).status,409)
 assert.equal((await call(`/api/admin/orders/${a.token}`,{method:'PATCH',body:{name:a.name,scheduleId:today,status:'rejected',cart:a.cart}})).status,409)
 const refundBody={requestId:randomUUID(),amount:1800,reason:'Payment returned after collection',cancelOrder:false}
 assert.equal((await call(`/api/admin/orders/${a.token}/refund`,{body:refundBody})).status,200)
 assert.equal((await call(`/api/admin/orders/${a.token}/refund`,{body:refundBody})).status,200)
 assert.equal((await sql.query('SELECT count(*)::int AS n FROM refunds WHERE request_id=$1',[refundBody.requestId])).rows[0].n,1)
 assert.equal((await call(`/api/admin/orders/${a.token}/refund`,{body:{...refundBody,requestId:randomUUID(),amount:1}})).status,409)
 assert.equal(await stock('kecik'),stockBefore)
 assert.equal((await call(`/api/orders/${a.token}`,{token:''})).data.status,'collected')
 assert.equal((await call('/api/admin/logs')).data.revenue,revenueBefore-1800)
 const beforeAdjustment=await stock('kecik')
 assert.equal((await call('/api/admin/stock',{body:{kind:'adjustment',productId:'kecik',date:today,quantity:-3,note:'Broken bottles'}})).status,200)
 assert.equal(await stock('kecik'),beforeAdjustment-3)
 assert.equal((await call('/api/admin/stock',{body:{kind:'adjustment',productId:'kecik',date:today,quantity:1,note:'Physical return inspected'}})).status,200)
 assert.equal(await stock('kecik'),beforeAdjustment-2)
 assert.equal((await call('/api/admin/stock',{body:{kind:'adjustment',productId:'kecik',date:today,quantity:-100000,note:'Invalid reduction'}})).status,409)
 assert.equal((await call('/api/admin/stock',{body:{kind:'adjustment',productId:'kecik',date:today,quantity:-1,note:''}})).status,400)
 assert.equal((await call(`/api/orders/${unpaid.data.token}`,{token:'',method:'PATCH',body:{action:'collect'}})).data.status,'collected')
 assert.equal((await call('/api/admin',{method:'PATCH',body:{action:'manual-payment',orderToken:unpaid.data.token,paymentStatus:'paid'}})).data.order.status,'collected')
 assert.equal((await call('/api/admin',{method:'PATCH',body:{action:'manual-payment',orderToken:unpaid.data.token,paymentStatus:'unpaid'}})).data.order.status,'collected')
 findings.refundsAndAdjustments='PASS: collected stock preserved, refunds idempotent and reflected in net revenue, signed adjustments guarded, manual payment marking preserved'

 const expired=await call('/api/orders',{token,body:{requestId:randomUUID(),scheduleId:dates[1],cart:{kecik:1}}});assert.equal(expired.status,200)
 await sql.query("UPDATE orders SET expires_at=now()-interval '1 minute' WHERE token=$1",[expired.data.token])
 const expiredTicket=(await call(`/api/orders/${expired.data.token}`,{token:''})).data
 const expiredPage=await browser.newPage({extraHTTPHeaders:{'X-Forwarded-For':'127.0.0.92'}});await expiredPage.goto(base+'/drop?t='+expired.data.token,{waitUntil:'networkidle'})
 findings.expiredReservation={status:expiredTicket.status,uploadButtonCount:await expiredPage.getByRole('button',{name:'Upload payment receipt',exact:true}).count(),uploadStatus:(await upload(token,{orderToken:expired.data.token})).status,uiMentionsExpired:(await expiredPage.locator('.pickup-page').innerText()).toLowerCase().includes('expired')}
 assert.equal(findings.expiredReservation.uploadButtonCount,0);assert.equal(findings.expiredReservation.uiMentionsExpired,true)
 const reopened=await call(`/api/admin/orders/${expired.data.token}/reopen`,{body:{}});assert.equal(reopened.status,200)
 const uploadLink=new URL(reopened.data.receiptUploadUrl);assert.ok(uploadLink.hash)
 const reopenedRead=await fetch(base+`/api/orders/${expired.data.token}/receipt-upload`,{headers:{Authorization:`Receipt ${uploadLink.hash.slice(1)}`}});assert.equal(reopenedRead.status,200)
 await expiredPage.screenshot({path:'test-results/recovery-flows/expired-reservation.png',fullPage:true})
 await call('/api/identity',{token:'',body:{phone:'0129990093',name:'Protected Profile',protectHistory:true,password:'protected-audit-password'}})
 const refreshContext=await browser.newContext({viewport:{width:390,height:900},extraHTTPHeaders:{'X-Forwarded-For':'127.0.0.93'}});const refreshPage=await refreshContext.newPage();refreshPage.setDefaultTimeout(15000)
 await begin(refreshPage,'0129990093','Refresh Buyer');await refreshPage.getByRole('button',{name:'Continue to payment',exact:true}).click();await refreshPage.getByRole('heading',{name:'Pay with DuitNow QR',exact:true}).waitFor();await refreshPage.getByRole('button',{name:'Close checkout',exact:true}).click()
 const beforeRefresh=await refreshPage.locator('.active-ticket').count();await refreshPage.reload({waitUntil:'networkidle'});await delay(500)
 findings.refreshProtectedCheckout={activeTicketBefore:beforeRefresh,activeTicketAfter:await refreshPage.locator('.active-ticket').count(),reservationStillExists:(await sql.query("SELECT count(*)::int AS count FROM orders WHERE customer_name='Refresh Buyer'")).rows[0].count}
 await call('/api/identity',{token:'',body:{phone:'0129990094',name:'Network Profile',protectHistory:true,password:'network-audit-password'}})
 const networkContext=await browser.newContext({viewport:{width:390,height:900},extraHTTPHeaders:{'X-Forwarded-For':'127.0.0.94'}});const networkPage=await networkContext.newPage();networkPage.setDefaultTimeout(15000)
 let interrupt=true
 await networkPage.route('**/api/orders',async route=>{if(route.request().method()==='POST'&&interrupt){interrupt=false;const response=await route.fetch();assert.equal(response.status(),200);await route.abort('failed')}else await route.continue()})
 await begin(networkPage,'0129990094','Network Buyer');await networkPage.getByRole('button',{name:'Continue to payment',exact:true}).click();await networkPage.locator('#checkout-error').waitFor()
 await networkPage.getByRole('button',{name:'Continue to payment',exact:true}).click();await networkPage.getByRole('heading',{name:'Pay with DuitNow QR',exact:true}).waitFor()
 assert.equal(findings.refreshProtectedCheckout.activeTicketAfter,1)
 findings.interruptedCheckoutRetry={ordersCreated:(await sql.query("SELECT count(*)::int AS count FROM orders WHERE customer_name='Network Buyer'")).rows[0].count}
 assert.equal(findings.interruptedCheckoutRetry.ordersCreated,1)
 const networkOrder=(await sql.query("SELECT token FROM orders WHERE customer_name='Network Buyer'")).rows[0]
 assert.equal((await call(`/api/admin/orders/${networkOrder.token}/payment`,{method:'PATCH',body:{paymentStatus:'rejected',expectedStatus:'pending_payment',expectedPaymentStatus:'unpaid'}})).status,200)
 await networkPage.getByText('Order cancelled',{exact:true}).waitFor()
 assert.equal(await networkPage.getByRole('button',{name:'I’ve paid — upload receipt',exact:true}).isDisabled(),true)
 assert.equal(await networkPage.locator('.payment-card').count(),0)
 findings.cancelledCheckout='PASS: an operator cancellation disables payment and receipt upload in the open checkout'

 // Recovery is admin-assisted, single-use, preserves history and revokes sessions.
 assert.equal((await call('/api/admin/recovery',{token:'',body:{phone:'0129990093',verified:true}})).status,401)
 assert.equal((await call('/api/admin/recovery',{body:{phone:'0129990093',verified:false}})).status,400)
 const oldLogin=await call('/api/identity',{token:'',body:{phone:'0129990093',mode:'history',password:'protected-audit-password'}});assert.equal(oldLogin.status,200)
 const beforeRecovery=(await sql.query("SELECT id,name,(SELECT count(*)::int FROM orders WHERE customer_id=customers.id) AS orders FROM customers WHERE phone='60129990093'")).rows[0]
 const first=await call('/api/admin/recovery',{body:{phone:'0129990093',verified:true}}),second=await call('/api/admin/recovery',{body:{phone:'0129990093',verified:true}})
 const oldRecovery=new URL(first.data.url).hash.slice(1),newRecovery=new URL(second.data.url).hash.slice(1)
 assert.equal((await call('/api/identity/recover',{token:'',body:{token:oldRecovery,password:'new-audit-password'}})).status,410)
 assert.equal((await call('/api/identity/recover',{token:'',body:{token:newRecovery,password:'new-audit-password'}})).status,200)
 assert.equal((await call('/api/identity/recover',{token:'',body:{token:newRecovery,password:'new-audit-password'}})).status,410)
 assert.equal((await call('/api/orders',{token:oldLogin.data.token})).status,401)
 assert.equal((await call('/api/identity',{token:'',body:{phone:'0129990093',mode:'history',password:'protected-audit-password'}})).status,403)
 const afterRecovery=(await sql.query("SELECT id,name,(SELECT count(*)::int FROM orders WHERE customer_id=customers.id) AS orders FROM customers WHERE phone='60129990093'")).rows[0]
 assert.deepEqual(afterRecovery,beforeRecovery)
 const latest=await call('/api/admin/recovery',{body:{phone:'0129990093',verified:true}})
 const recoveryPage=await browser.newPage({viewport:{width:390,height:900},extraHTTPHeaders:{'X-Forwarded-For':'127.0.0.95'}})
 await recoveryPage.goto(latest.data.url,{waitUntil:'networkidle'});await recoveryPage.getByLabel('New history password',{exact:true}).fill('ui-recovered-password');await recoveryPage.getByLabel('Confirm new password',{exact:true}).fill('ui-recovered-password');await recoveryPage.getByRole('button',{name:'Set new password',exact:true}).click();await recoveryPage.getByRole('link',{name:'Open my transactions',exact:true}).waitFor();await recoveryPage.getByRole('link',{name:'Open my transactions',exact:true}).click();await recoveryPage.getByRole('button',{name:'Lock history',exact:true}).waitFor()
 findings.passwordRecovery='PASS: admin verification, rotation, single use, history preserved, old sessions revoked, reset page unlocks history'
 const audit=await call('/api/admin/audit?pageSize=100');assert.equal(audit.status,200);assert.ok(audit.data.entries.some(e=>e.action==='refund_recorded'));assert.ok(audit.data.entries.some(e=>e.entityType==='stock'));assert.ok(audit.data.entries.some(e=>e.action==='password_recovered'));assert.equal((await call('/api/admin/audit',{token:''})).status,401)
 const logged=JSON.stringify((await sql.query('SELECT before,after FROM audit_events')).rows);assert.equal(logged.includes(a.token),false);assert.equal(logged.includes('passwordHash'),false);assert.equal(logged.includes('new-audit-password'),false)
 await admin.getByRole('link',{name:'Products',exact:true}).click();await admin.getByRole('link',{name:'Change history',exact:true}).click();await admin.getByRole('heading',{name:'Change history',exact:true}).waitFor();assert.ok(await admin.getByRole('table').count());for (const width of [320,390,1440]) {
  await admin.setViewportSize({width,height:1000})
  assert.equal(await admin.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'History stays within the viewport')
  if(width===1440) assert.ok(await admin.locator('.log-table-card').evaluate(el=>el.clientWidth)>800,'History uses the full desktop table width')
  await admin.screenshot({path:`test-results/recovery-flows/change-history-${width}.png`})
 }
 // Verify the new operator controls, including nested refund dialogs.
 await admin.getByRole('link',{name:'Calendar',exact:true}).click()
 await admin.locator(`.transaction-row[data-token="${late.token}"] .transaction-open`).click()
 await admin.getByRole('button',{name:'Record refund',exact:true}).click()
 const refundDialog=admin.getByRole('dialog',{name:'Record refund',exact:true})
 await refundDialog.getByLabel('Refund amount (RM)',{exact:true}).fill('1.00');await refundDialog.getByLabel('Refund reason',{exact:true}).fill('UI partial refund')
 for(const width of [320,390,1440]){await admin.setViewportSize({width,height:1000});assert.equal(await admin.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await refundDialog.screenshot({path:`test-results/recovery-flows/refund-${width}.png`})}
 await refundDialog.getByRole('button',{name:'Record refund',exact:true}).click();await refundDialog.waitFor({state:'hidden'})
 assert.equal((await call(`/api/orders/${late.token}`,{token:''})).data.refundedTotal,100)
 await admin.getByRole('dialog').getByRole('button',{name:'Close dialog',exact:true}).click()
 await admin.getByRole('link',{name:'Products',exact:true}).click()
 await admin.locator('.catalog-product[data-product-id="kecik"]').getByRole('button',{name:/^Add stock for /}).click();await admin.getByLabel('Entry type',{exact:true}).selectOption('adjustment')
 await admin.locator('#stock-product').selectOption('kecik');await admin.locator('#stock-quantity').fill('-1');await admin.locator('#stock-note').fill('UI broken bottle')
 await admin.getByRole('button',{name:'Save stock entry',exact:true}).click();await admin.getByRole('dialog').waitFor({state:'hidden'})
 assert.equal((await sql.query("SELECT quantity,kind FROM stock_entries WHERE note='UI broken bottle'")).rows[0].quantity,-1)
 await admin.getByRole('link',{name:'Calendar',exact:true}).click();await admin.getByRole('button',{name:'Customer recovery',exact:true}).click()
 await admin.getByLabel('Customer mobile number',{exact:true}).fill('0129990093');await admin.getByRole('button',{name:'Find customer',exact:true}).click();await admin.getByRole('checkbox',{name:'I verified this customer through their existing contact.',exact:true}).check();await admin.getByRole('button',{name:'Create one-time recovery link',exact:true}).click();await admin.getByLabel('Private recovery link',{exact:true}).waitFor()
 assert.ok(new URL(await admin.getByLabel('Private recovery link',{exact:true}).inputValue()).hash.length>40)
 await admin.getByRole('dialog').screenshot({path:'test-results/recovery-flows/operator-recovery.png'})
 findings.auditHistory='PASS: before/after history is authenticated, visible and excludes password/token credentials'
 await writeFile('test-results/recovery-flows/findings.json',JSON.stringify(findings,null,2));console.log(JSON.stringify(findings,null,2))
}finally{await browser?.close();if(server&&server.exitCode===null&&server.signalCode===null){const exit=new Promise(r=>server.once('exit',r));server.kill('SIGTERM');await exit}await sql.end().catch(()=>{});if(created)await root.query(`DROP DATABASE "${name}" WITH (FORCE)`);await root.end();await rm(uploads,{recursive:true,force:true})}
