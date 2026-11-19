import './helpers/disable-telegram.mjs'
import assert from 'node:assert/strict'
import {spawn} from 'node:child_process'
import {setTimeout as delay} from 'node:timers/promises'
import {mkdir} from 'node:fs/promises'
import {chromium} from 'playwright'
const base='http://127.0.0.1:3066'
const server=spawn(process.execPath,['.output/server/index.mjs'],{env:{...process.env,NUXT_PUBLIC_DEMO:'true',NUXT_DATABASE_URL:'',NITRO_HOST:'127.0.0.1',NITRO_PORT:'3066'},stdio:['ignore','pipe','pipe']})
let browser,output='';server.stdout.on('data',x=>output+=x);server.stderr.on('data',x=>output+=x)
try{
 let ready=false;for(let i=0;i<100;i++){try{if((await fetch(base+'/api/health')).ok){ready=true;break}}catch{}await delay(100)}assert.ok(ready,output)
 await mkdir('test-results/image-loading',{recursive:true});browser=await chromium.launch()
 for(const width of [390,1440]){
  const page=await browser.newPage({viewport:{width,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message))
  let release;const held=new Promise(r=>release=r)
  await page.route('**/images/storefront/hero.webp',async route=>{await held;await route.continue()})
  await page.goto(base,{waitUntil:'domcontentloaded'})
  const hero=page.locator('.hero-photo');await hero.locator('img').waitFor({state:'attached'});assert.equal(await hero.getAttribute('data-state'),'loading')
  const before=await hero.boundingBox();release()
  await page.waitForFunction(()=>document.querySelector('.hero-photo')?.dataset.state==='loaded')
  assert.deepEqual(await hero.boundingBox(),before,'Loading photos must not shift the layout')
  assert.equal(await page.locator('.product-image img').first().getAttribute('loading'),'eager')
  assert.equal(await page.locator('.product-image img').nth(2).getAttribute('loading'),'lazy')
  await page.locator('.product-image').first().scrollIntoViewIfNeeded()
  await page.waitForFunction(()=>document.querySelector('.product-image .image-reveal')?.dataset.state==='loaded')
  await page.waitForTimeout(200);await page.screenshot({path:`test-results/image-loading/loaded-${width}.png`})
  await page.emulateMedia({reducedMotion:'reduce'})
  assert.equal(await hero.locator('img').evaluate(el=>getComputedStyle(el).transitionDuration),'0s')
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)
  assert.deepEqual(errors,[]);await page.close()
 }
 const initial=await browser.newPage({javaScriptEnabled:false})
 await initial.goto(base,{waitUntil:'networkidle'})
 assert.equal(await initial.locator('.hero-photo img').evaluate(el=>el.naturalWidth>0&&getComputedStyle(el).opacity==='1'),true,'An already loaded image is visible before hydration')
 await initial.close()
 const failed=await browser.newPage()
 await failed.route('**/images/storefront/kecik.webp',route=>route.abort())
 await failed.goto(base,{waitUntil:'networkidle'})
 await failed.locator('.product-image').first().locator('.bottle-art').waitFor()
 await failed.locator('.product-image').nth(2).scrollIntoViewIfNeeded()
 await failed.locator('.product-image').nth(2).locator('.bottle-art').waitFor()
 assert.equal(await failed.locator('.product-image .image-reveal[data-state="failed"]').count(),2)
 console.log('PASS images: slow-load placeholders, fixed dimensions, eager/lazy requests, reduced motion, mobile/desktop layout and pre-hydration error fallbacks.')
}finally{if(browser)await browser.close();if(server.exitCode===null&&server.signalCode===null){const ended=new Promise(r=>server.once('exit',r));server.kill('SIGTERM');await ended}}
