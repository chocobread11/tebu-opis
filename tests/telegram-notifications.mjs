import 'dotenv/config'
import assert from 'node:assert/strict'
import {spawn,spawnSync} from 'node:child_process'
import {randomBytes,randomUUID} from 'node:crypto'
import {createServer} from 'node:http'
import {resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
import {setTimeout as delay} from 'node:timers/promises'
import pg from 'pg'
import sharp from 'sharp'
import {chromium} from 'playwright'
import {mkdtemp,rm,mkdir} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
const name=`tebu_telegram_test_${Date.now()}`,url=new URL(process.env.NUXT_DATABASE_URL);url.pathname=`/${name}`
const root=new pg.Client({connectionString:process.env.NUXT_DATABASE_URL}),sql=new pg.Client({connectionString:url.toString()})
const key=randomBytes(32).toString('hex'),base='http://127.0.0.1:3067',requests=[]
let mode='hold',release,expectedChat='-100123'
const fixture=createServer(async(req,res)=>{
 let raw='';for await(const chunk of req)raw+=chunk
 const body=JSON.parse(raw);requests.push(body)
 assert.equal(req.url,'/botfixture-token/sendMessage');assert.equal(body.chat_id,expectedChat)
 if(mode==='hold') await new Promise(r=>release=r)
 if(mode==='fail'||mode==='hold'){res.writeHead(503,{'Content-Type':'application/json'});res.end(JSON.stringify({ok:false}));return}
 res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({ok:true,result:{message_id:1000+requests.length}}))
})
await new Promise(r=>fixture.listen(0,'127.0.0.1',r))
const uploads=await mkdtemp(join(tmpdir(),'tebu-telegram-'))
const env={...process.env,NUXT_DATABASE_URL:url.toString(),NUXT_ADMIN_KEY:key,NUXT_TELEGRAM_BOT_TOKEN:'fixture-token',NUXT_TELEGRAM_CHAT_ID:'',TEBU_TELEGRAM_FIXTURE:`http://127.0.0.1:${fixture.address().port}`,NUXT_SITE_URL:'https://tebu.example',NUXT_UPLOAD_STORAGE:'local',NUXT_UPLOAD_DIR:uploads,NUXT_PUBLIC_DEMO:'false',NUXT_PUBLIC_TESTING_CALENDAR:'true',NUXT_PUBLIC_DUITNOW_QR:'/favicon.svg',NITRO_HOST:'127.0.0.1',NITRO_PORT:'3067'}
const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kuala_Lumpur',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())
let server,browser,created=false,output=''
const call=async(path,{body,token=key,...options}={})=>{const r=await fetch(base+path,{...options,method:options.method||(body?'POST':'GET'),headers:{'X-Forwarded-For':'127.0.0.98',...(token?{Authorization:`Bearer ${token}`} :{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});return{status:r.status,data:await r.json()}}
async function until(check,message){for(let i=0;i<150;i++){if(await check())return;await delay(100)}assert.fail(message+'\n'+output)}
async function start(){server=spawn(process.execPath,['--import',pathToFileURL(resolve('tests/helpers/mock-telegram.mjs')).href,'.output/server/index.mjs'],{env,stdio:['ignore','pipe','pipe']});server.stdout.on('data',b=>output+=b);server.stderr.on('data',b=>output+=b);await until(async()=>{try{return(await fetch(base+'/api/health')).ok}catch{return false}},'Server did not start')}
async function stop(){if(server?.exitCode===null&&server?.signalCode===null){const ended=new Promise(r=>server.once('exit',r));server.kill('SIGTERM');await ended}server=null}
async function receiptFor(order, token, cookie='') {
 const file=await sharp({create:{width:100,height:100,channels:3,background:'#ddd'}}).png().toBuffer()
 const form=new FormData();form.set('file',new Blob([file],{type:'image/png'}),'receipt.png');form.set('orderToken',order.token)
 const result=await fetch(base+'/api/uploads',{method:'POST',headers:{Authorization:`Bearer ${token}`,'X-Forwarded-For':'127.0.0.98',...(cookie?{Cookie:cookie}:{})},body:form})
 assert.equal(result.status,200);return result.json()
}
try{
 await root.connect();await root.query(`CREATE DATABASE "${name}"`);created=true
 const migration=spawnSync('bun',['prisma','migrate','deploy'],{env,encoding:'utf8'});assert.equal(migration.status,0,migration.stderr)
 await sql.connect();await sql.query('INSERT INTO schedules(id,capacity) VALUES($1,100)',[today]);await sql.query("INSERT INTO stock_entries(product_id,date,quantity) SELECT id,$1,100 FROM products WHERE kind='bottle'",[today])
 // Old queued checkout alerts must not be sent after switching to receipt-only notifications.
 await sql.query("INSERT INTO telegram_notifications(order_id,event,message) VALUES($1,'created','Old checkout alert')",[randomUUID()])
 await start()
 assert.equal((await call('/api/admin/settings',{method:'PUT',body:{telegramEnabled:true,telegramChatId:'-100123'}})).status,200)
 const identity=await call('/api/identity',{token:'',body:{phone:'0129990098',name:'Returning Buyer'}});assert.equal(identity.status,200);const token=identity.data.token
 const body={requestId:randomUUID(),scheduleId:today,cart:{kecik:2},remarks:'Keep frozen'}
 const order=await call('/api/orders',{token,body});assert.equal(order.status,200)
 assert.equal((await call('/api/orders',{token,body})).data.token,order.data.token)
 assert.equal(requests.length,0,'Checkout creation must not send Telegram alerts')
 assert.equal((await sql.query("SELECT count(*)::int AS n FROM telegram_notifications WHERE event <> 'created'")).rows[0].n,0)
 const receipt=await receiptFor(order.data,token)
 const submit=()=>call(`/api/orders/${order.data.token}`,{token,method:'PATCH',body:{action:'receipt',receiptId:receipt.id}})
 const submitting=submit();await until(()=>requests.length===1,'Receipt notification was not sent')
 assert.equal(await Promise.race([submitting.then(()=>true),delay(1000).then(()=>false)]),true,'Receipt submission must not wait for Telegram')
 assert.equal((await submitting).data.status,'pending_review')
 assert.equal((await submit()).status,200)
 assert.equal((await sql.query("SELECT count(*)::int AS n FROM telegram_notifications WHERE event LIKE 'receipt:%'")).rows[0].n,1)
 assert.ok(requests[0].text.startsWith('Payment receipt submitted'))
 assert.ok(requests[0].text.includes(`https://tebu.example/drop?t=${order.data.token}`))
 assert.ok(requests[0].text.includes('awaiting your review'));assert.equal(requests[0].text.includes(key),false)
 release();await until(async()=>!!(await sql.query("SELECT last_error FROM telegram_notifications WHERE event LIKE 'receipt:%'")).rows[0].last_error,'Failure was not recorded')
 assert.equal((await call('/api/admin/settings',{method:'PUT',body:{telegramEnabled:false}})).status,200)
 mode='success';await sql.query("UPDATE telegram_notifications SET next_attempt_at=now() WHERE event LIKE 'receipt:%'")
 await delay(5500);assert.equal(requests.length,1,'Disabling alerts pauses queued retries without restarting')
 expectedChat='-100456'
 assert.equal((await call('/api/admin/settings',{method:'PUT',body:{telegramEnabled:true,telegramChatId:expectedChat}})).status,200)
 await until(async()=>!!(await sql.query("SELECT sent_at FROM telegram_notifications WHERE event LIKE 'receipt:%'")).rows[0].sent_at,'Receipt alert was not retried')
 assert.equal(requests.length,2)
 assert.equal((await call('/api/admin/orders',{body:{requestId:randomUUID(),scheduleId:today,name:'Manual Buyer',paymentStatus:'unpaid',cart:{kecik:1}}})).status,200)
 assert.equal((await call('/api/orders',{token,body:{...body,requestId:randomUUID(),cart:{kecik:10000}}})).status,409)
 assert.equal((await sql.query("SELECT count(*)::int AS n FROM telegram_notifications WHERE event LIKE 'receipt:%'")).rows[0].n,1)
 assert.equal((await call('/api/admin/settings',{method:'PUT',body:{siteUrl:'https://updated.example'}})).status,200)
 const second=await call('/api/orders',{token,body:{...body,requestId:randomUUID()}});assert.equal(second.status,200);assert.equal(requests.length,2)
 mode='fail';const secondReceipt=await receiptFor(second.data,token)
 assert.equal((await call(`/api/orders/${second.data.token}`,{token,method:'PATCH',body:{action:'receipt',receiptId:secondReceipt.id}})).status,200)
 await until(async()=>!!(await sql.query('SELECT n.last_error FROM telegram_notifications n JOIN orders o ON o.id=n.order_id WHERE o.token=$1',[second.data.token])).rows[0].last_error,'Returning customer receipt alert was not attempted')
 await stop();await sql.query("UPDATE telegram_notifications SET next_attempt_at=now(),lease_until=now()-interval '1 second' WHERE sent_at IS NULL")
 mode='success';await start()
 await until(async()=>(await sql.query("SELECT count(*)::int AS n FROM telegram_notifications WHERE event LIKE 'receipt:%' AND sent_at IS NOT NULL")).rows[0].n===2,'Pending alert did not survive restart')
 assert.ok(requests[3].text.includes('https://updated.example/admin/calendar'))
 assert.equal(requests.length,4);assert.ok(requests[3].text.includes(`https://updated.example/drop?t=${second.data.token}`));assert.equal((await submit()).status,200);assert.equal(requests.length,4)
 const before=(await call('/api/catalog',{token:''})).data.products.find(p=>p.id==='kecik').stocks[0].remaining
 await sql.query("UPDATE orders SET expires_at=now()-interval '2 hours' WHERE token=$1",[order.data.token])
 assert.equal((await call('/api/catalog',{token:''})).data.products.find(p=>p.id==='kecik').stocks[0].remaining,before)
 assert.equal((await call(`/api/admin/orders/${order.data.token}`,{token:''})).status,401)
 assert.equal((await fetch(base+`/api/media/${receipt.id}`)).status,401)
 const reviewUrl=new URL(requests[0].text.split('Review receipt: ')[1]);assert.equal(reviewUrl.searchParams.get('order'),order.data.token)
 browser=await chromium.launch();const context=await browser.newContext({viewport:{width:390,height:900}}),page=await context.newPage(),pageErrors=[];page.on('pageerror',e=>pageErrors.push(e.message))
 const link=base+reviewUrl.pathname+reviewUrl.search
 await page.goto(link,{waitUntil:'networkidle'});await page.getByLabel('Admin key',{exact:true}).waitFor()
 await page.getByLabel('Admin key',{exact:true}).fill(key);await page.getByRole('button',{name:'Open pantry ops',exact:true}).click()
 await page.getByRole('dialog').getByRole('img',{name:'Customer payment receipt',exact:true}).waitFor()
 const session=(await context.cookies()).find(c=>c.name==='tebu_admin_session');assert.ok(session.httpOnly)
 assert.equal(await page.evaluate(()=>document.cookie.includes('tebu_admin_session')),false)
 assert.equal(await page.evaluate(secret=>JSON.stringify(localStorage)+JSON.stringify(sessionStorage),key).then(value=>value.includes(key)),false)
 await page.reload({waitUntil:'networkidle'});await page.getByRole('dialog').getByRole('img',{name:'Customer payment receipt',exact:true}).waitFor();assert.equal(await page.getByLabel('Admin key',{exact:true}).count(),0)
 const tab=await context.newPage();await tab.goto(link,{waitUntil:'networkidle'});await tab.getByRole('dialog').getByRole('img',{name:'Customer payment receipt',exact:true}).waitFor();await tab.close()
 await mkdir('test-results/telegram',{recursive:true})
 for(const width of [390,1440]){await page.setViewportSize({width,height:1000});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:`test-results/telegram/receipt-review-${width}.png`})}
 await page.getByRole('button',{name:'Confirm payment',exact:true}).click();await until(async()=>(await sql.query('SELECT status FROM orders WHERE token=$1',[order.data.token])).rows[0].status==='confirmed','Delayed approval failed')
 const mixed=await call('/api/orders',{token,body:{...body,requestId:randomUUID()}});assert.equal(mixed.status,200)
 await receiptFor(mixed.data,token,`tebu_admin_session=${session.value}`)
 assert.equal(requests.length,4,'Merely uploading a file does not send an alert')
 await page.keyboard.press('Escape');await page.getByRole('button',{name:'Sign out of admin',exact:true}).click();await page.getByLabel('Admin key',{exact:true}).waitFor()
 assert.equal((await fetch(base+'/api/admin',{headers:{Cookie:`tebu_admin_session=${session.value}`}})).status,401,'Signing out revokes the session')
 assert.deepEqual(pageErrors,[]);assert.equal(output.includes('fixture-token'),false)
 const burst=[]
 for(let i=0;i<6;i++){
  const entry=await call('/api/orders',{token,body:{...body,requestId:randomUUID(),cart:{kecik:1}}});assert.equal(entry.status,200)
  burst.push({order:entry.data,receipt:await receiptFor(entry.data,token)})
 }
 const heldBefore=(await call('/api/catalog',{token:''})).data.products.find(p=>p.id==='kecik').stocks[0].remaining
 const results=await Promise.all(burst.map(entry=>call(`/api/orders/${entry.order.token}`,{token,method:'PATCH',body:{action:'receipt',receiptId:entry.receipt.id}})))
 for(const result of results){assert.equal(result.status,200,JSON.stringify(result.data));assert.equal(result.data.status,'pending_review')}
 assert.equal((await call('/api/catalog',{token:''})).data.products.find(p=>p.id==='kecik').stocks[0].remaining,heldBefore)
 console.log('PASS concurrency: six receipts submitted together preserve their reservations without connection-pool starvation.')
 console.log('PASS Telegram: only submitted receipts notify, one alert per receipt, checkout/upload retries deduplicated, failures and restart recovery, manual orders excluded, private receipt deep links, remembered sign-in across reload/tabs, sign-out revocation and approval after the deadline.')
}finally{
 if(release)release();if(browser)await browser.close();await stop();await new Promise(r=>fixture.close(r));await sql.end().catch(()=>{});if(created)await root.query(`DROP DATABASE "${name}" WITH (FORCE)`);await root.end();await rm(uploads,{recursive:true,force:true})
}
