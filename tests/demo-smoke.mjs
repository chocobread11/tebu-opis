import './helpers/disable-telegram.mjs'
import assert from 'node:assert/strict'
import {spawn} from 'node:child_process'
import {setTimeout as delay} from 'node:timers/promises'
import {chromium} from 'playwright'
const base='http://127.0.0.1:3065'
const server=spawn(process.execPath,['.output/server/index.mjs'],{env:{...process.env,NUXT_PUBLIC_DEMO:'true',NUXT_DATABASE_URL:'',NITRO_HOST:'127.0.0.1',NITRO_PORT:'3065'},stdio:['ignore','pipe','pipe']})
let browser,output='';server.stdout.on('data',x=>output+=x);server.stderr.on('data',x=>output+=x)
try{
 let ready=false;for(let i=0;i<100;i++){try{if((await fetch(base+'/api/health')).ok){ready=true;break}}catch{}await delay(100)}assert.ok(ready,output)
 browser=await chromium.launch();const page=await browser.newPage({viewport:{width:390,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message))
 await page.goto(base,{waitUntil:'networkidle'})
 await page.getByRole('button',{name:'Add Tebu 1 · Kecik',exact:true}).click()
 await page.getByRole('button',{name:'LOCK MY BOTTLE',exact:true}).click()
 await page.getByLabel('Malaysian mobile number').fill('0123456789')
 await page.getByLabel('What should we write on your bag?',{exact:true}).fill('Demo Tester')
 await page.getByRole('button',{name:'Continue to payment',exact:true}).click()
 await page.getByRole('button',{name:'Continue demo',exact:true}).click()
 await page.getByRole('button',{name:'Use a sample receipt',exact:true}).click()
 await page.getByRole('button',{name:'Submit my receipt',exact:true}).click()
 await page.getByRole('button',{name:'View my pickup ticket',exact:true}).waitFor()
 await page.getByRole('button',{name:'Close checkout',exact:true}).click()
 await page.goto(base+'/admin/products',{waitUntil:'networkidle'})
 await page.getByLabel('Admin key',{exact:true}).fill('demo')
 await page.getByRole('button',{name:'Open pantry ops',exact:true}).click()
 await page.getByRole('button',{name:'Add product',exact:true}).waitFor()
 await page.getByRole('link',{name:'Change history',exact:true}).click()
 await page.getByText('Change history is available in the connected inventory app.',{exact:true}).waitFor()
 assert.deepEqual(errors,[])
 console.log('PASS demo: checkout, sample receipt, inventory login and history navigation without browser errors.')
}finally{if(browser)await browser.close();if(server.exitCode===null&&server.signalCode===null){const ended=new Promise(r=>server.once('exit',r));server.kill('SIGTERM');await ended}}
