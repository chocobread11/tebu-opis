import './helpers/disable-telegram.mjs'
import assert from 'node:assert/strict'
import {spawn,spawnSync} from 'node:child_process'
import {randomBytes,randomUUID} from 'node:crypto'
import {setTimeout as delay} from 'node:timers/promises'
import {mkdir} from 'node:fs/promises'
import {chromium} from 'playwright'
import pg from 'pg'
const name=`tebu_settings_${Date.now()}`,url=new URL(process.env.NUXT_DATABASE_URL);url.pathname=`/${name}`
const root=new pg.Client({connectionString:process.env.NUXT_DATABASE_URL}),sql=new pg.Client({connectionString:url.toString()})
const base='http://127.0.0.1:3069',key=randomBytes(32).toString('hex')
const env={...process.env,NUXT_DATABASE_URL:url.toString(),NUXT_ADMIN_KEY:key,NUXT_SITE_URL:'https://initial.example',NUXT_PUBLIC_MERCHANT_NAME:'Default Merchant',NUXT_PUBLIC_SUPPORT_WHATSAPP:'60128880000',NUXT_PUBLIC_DEMO:'false',NUXT_PUBLIC_TESTING_CALENDAR:'true',NUXT_PUBLIC_DUITNOW_QR:'/favicon.svg',NITRO_HOST:'127.0.0.1',NITRO_PORT:'3069'}
const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kuala_Lumpur',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())
let server,browser,created=false,output=''
async function call(path,{body,token=key,method,...options}={}){const r=await fetch(base+path,{...options,method:method||(body?'POST':'GET'),headers:{'X-Forwarded-For':'127.0.0.100',...(token?{Authorization:`Bearer ${token}`} :{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});return{status:r.status,data:await r.json()}}
const save=body=>call('/api/admin/settings',{method:'PUT',body})
async function start(){server=spawn(process.execPath,['.output/server/index.mjs'],{env,stdio:['ignore','pipe','pipe']});server.stdout.on('data',b=>output+=b);server.stderr.on('data',b=>output+=b);for(let i=0;i<100;i++){try{if((await fetch(base+'/api/health')).ok)return}catch{}await delay(100)}assert.fail(output)}
async function stop(){if(server?.exitCode===null&&server?.signalCode===null){const end=new Promise(r=>server.once('exit',r));server.kill('SIGTERM');await end}server=null}
try{
 await root.connect();await root.query(`CREATE DATABASE "${name}"`);created=true
 const migration=spawnSync('bun',['prisma','migrate','deploy'],{env,encoding:'utf8'});assert.equal(migration.status,0,migration.stderr)
 await sql.connect();await sql.query("INSERT INTO shop_settings(id,whatsapp_opening,updated_at) VALUES('main','Legacy opening {tag}',now()) ON CONFLICT(id) DO UPDATE SET whatsapp_opening=EXCLUDED.whatsapp_opening")
 await sql.query('INSERT INTO schedules(id,capacity) VALUES($1,30)',[today]);await sql.query("INSERT INTO stock_entries(product_id,date,quantity) SELECT id,$1,30 FROM products WHERE kind='bottle'",[today])
 await start()
 assert.equal((await call('/api/admin/settings',{token:''})).status,401)
 assert.equal((await call('/api/admin/settings',{token:'',method:'PUT',body:{merchantName:'Anonymous'}})).status,401)
 const initial=(await call('/api/admin/settings')).data;assert.equal(initial.merchantName,'Default Merchant');assert.equal(initial.whatsappOpening,'Legacy opening {tag}');assert.equal(initial.siteUrl,'https://initial.example');assert.equal(initial.telegramBotConfigured,false)
 assert.deepEqual((await call('/api/shop-settings',{token:''})).data,{merchantName:'Default Merchant',supportWhatsapp:'60128880000'})
 for(const body of [{botToken:'forbidden'},{adminKey:'forbidden'},{siteUrl:'http://public.example'},{siteUrl:'https://user:pass@public.example'},{telegramChatId:'not-a-chat'},{supportWhatsapp:'invalid'}])assert.equal((await save(body)).status,400)
 assert.equal((await save({telegramEnabled:true,telegramChatId:'123456'})).status,400,'A missing server token cannot be enabled from the browser')
 const changed=await save({merchantName:'Settings Merchant',supportWhatsapp:'012 345 6789',whatsappOpening:'Salam {name}, ticket {tag}',siteUrl:'https://edited.example/',telegramEnabled:false,telegramChatId:'-100456'})
 assert.equal(changed.status,200);assert.equal(changed.data.supportWhatsapp,'60123456789');assert.equal(changed.data.siteUrl,'https://edited.example')
 assert.deepEqual((await call('/api/shop-settings',{token:''})).data,{merchantName:'Settings Merchant',supportWhatsapp:'60123456789'})
 const catalog=(await call('/api/catalog',{token:''})).data;assert.deepEqual(catalog.settings,{merchantName:'Settings Merchant',supportWhatsapp:'60123456789'});assert.equal(JSON.stringify(catalog).includes('-100456'),false)
 const identity=await call('/api/identity',{token:'',body:{phone:'0129990100',name:'Settings Customer'}});assert.equal(identity.status,200)
 const sale=await call('/api/orders',{token:identity.data.token,body:{requestId:randomUUID(),scheduleId:today,cart:{kecik:1}}});assert.equal(sale.status,200)
 const receiptLink=await call(`/api/orders/${sale.data.token}/receipt-link`,{token:identity.data.token,body:{}});assert.equal(receiptLink.status,200);assert.equal(new URL(receiptLink.data.url).origin,'https://edited.example')
 const recovery=await call('/api/admin/recovery',{body:{phone:'0129990100',verified:true}});assert.equal(recovery.status,200);assert.equal(new URL(recovery.data.url).origin,'https://edited.example')
 await sql.query("UPDATE orders SET expires_at=now()-interval '1 minute' WHERE token=$1",[sale.data.token])
 const reopened=await call(`/api/admin/orders/${sale.data.token}/reopen`,{body:{}});assert.equal(reopened.status,200);assert.equal(new URL(reopened.data.receiptUploadUrl).origin,'https://edited.example')
 browser=await chromium.launch();const page=await browser.newPage({viewport:{width:390,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message))
 await page.goto(base+'/admin/settings',{waitUntil:'networkidle'});await page.getByLabel('Admin key',{exact:true}).fill(key);await page.getByRole('button',{name:'Open pantry ops',exact:true}).click()
 await page.waitForFunction(()=>document.querySelector('#settings-merchant')?.value==='Settings Merchant')
 assert.equal(await page.getByRole('button',{name:'WhatsApp template',exact:true}).count(),0)
 assert.equal(await page.getByLabel('Enable Telegram receipt alerts',{exact:true}).isDisabled(),true)
 await page.getByLabel('Support WhatsApp number',{exact:true}).fill('invalid')
 await page.getByRole('button',{name:'Save changes',exact:true}).click();await page.getByRole('alert').waitFor();assert.equal(await page.getByLabel('Support WhatsApp number',{exact:true}).getAttribute('aria-invalid'),'true')
 await page.getByLabel('Support WhatsApp number',{exact:true}).fill('0129876543')
 await page.getByLabel('Merchant display name',{exact:true}).fill('UI Merchant')
 await page.getByLabel('Message opening',{exact:true}).fill('Hi {name}, your order {tag} is ready.')
 await page.getByRole('button',{name:'Save changes',exact:true}).click();await page.getByText('Settings saved. Changes are live.',{exact:true}).waitFor()
 assert.equal(await page.getByLabel('Support WhatsApp number',{exact:true}).inputValue(),'60129876543')
 assert.equal(await page.getByRole('button',{name:'Save changes',exact:true}).isDisabled(),true)
 await mkdir('test-results/settings',{recursive:true})
 for(const width of [320,390,1440]){await page.setViewportSize({width,height:1000});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.locator('.app-content').evaluate(element=>element.scrollTop=0);await page.screenshot({path:`test-results/settings/settings-${width}.png`})}
 await page.getByRole('link',{name:'Calendar',exact:true}).click();await page.getByRole('button',{name:'Customer recovery',exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'WhatsApp template',exact:true}).count(),0)
 await page.getByRole('link',{name:'Checklist',exact:true}).click();await page.getByRole('heading',{name:"Today's drop",exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Customer recovery',exact:true}).count(),0)
 await page.goto(base,{waitUntil:'networkidle'});await page.getByRole('button',{name:'Add Tebu 1 · Kecik',exact:true}).click();await page.getByRole('button',{name:'LOCK MY BOTTLE',exact:true}).click();await page.getByLabel('Malaysian mobile number').fill('0129990101');await page.getByLabel('What should we write on your bag?',{exact:true}).fill('UI Settings Buyer');await page.getByRole('button',{name:'Continue to payment',exact:true}).click();await page.getByText('UI Merchant',{exact:true}).waitFor()
 await sql.query("UPDATE orders SET expires_at=now()-interval '1 minute' WHERE customer_name='UI Settings Buyer'")
 const contact=page.getByRole('link',{name:'I already paid — contact operator',exact:true});await contact.waitFor();assert.ok((await contact.getAttribute('href')).includes('wa.me/60129876543'))
 assert.deepEqual(errors,[]);await browser.close();browser=null
 const audits=(await sql.query("SELECT before,after FROM audit_events WHERE entity_type='settings'")).rows;assert.ok(audits.length>=2);assert.equal(JSON.stringify(audits).includes(key),false)
 await stop();await start();const persisted=(await call('/api/admin/settings')).data;assert.equal(persisted.merchantName,'UI Merchant');assert.equal(persisted.supportWhatsapp,'60129876543');assert.equal(persisted.telegramChatId,'-100456');assert.equal(persisted.whatsappOpening,'Hi {name}, your order {tag} is ready.')
 console.log('PASS settings: preserved legacy/default values, authenticated validation, no credential editing, public/private separation, immediate merchant/support/URL changes, receipt/recovery/reopen links, accessible settings UI at 320/390/1440, recovery placement, audit history and persistence across restart.')
}finally{if(browser)await browser.close();await stop();await sql.end().catch(()=>{});if(created)await root.query(`DROP DATABASE "${name}" WITH (FORCE)`);await root.end()}
