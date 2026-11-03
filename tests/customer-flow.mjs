import { chromium } from 'playwright'
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
const base=process.env.TEBU_TEST_URL || 'http://127.0.0.1:3050'
const browser=await chromium.launch({headless:true})
async function visibleAction(page, name) {
 const button=page.getByRole('button',{name,exact:true});await button.waitFor();await page.waitForTimeout(550);const box=await button.boundingBox();const height=await page.evaluate(()=>innerHeight)
 assert.ok(box&&box.y>=0&&box.y+box.height<=height,`${name} must be visible without scrolling: ${JSON.stringify(box)} / ${height}`)
}
try {
 await mkdir('test-results',{recursive:true})
 for(const [width,height] of [[375,667],[768,900],[1440,1000]]) {
  const context=await browser.newContext({viewport:{width,height},hasTouch:width===375});const page=await context.newPage();page.setDefaultTimeout(12000);const errors=[];page.on('pageerror',e=>errors.push(e.message))
  await page.goto(base);await page.waitForTimeout(800)
  await page.getByRole('button',{name:'Add The Everyday Flask',exact:true}).click();await page.getByRole('button',{name:'LOCK MY BOTTLE'}).click()
  await visibleAction(page,'Continue to payment')
  await page.getByLabel('Malaysian mobile number').fill('0123456789');await page.getByLabel('What should we write on your bag?').fill('Flow Test')
  await page.getByRole('checkbox',{name:'Protect my past transactions with a password'}).check();await page.getByLabel('Create history password',{exact:true}).fill('history-test-123')
  await page.getByRole('button',{name:'Continue to payment',exact:true}).click();await visibleAction(page,'Continue demo')
  await page.screenshot({path:`test-results/payment-drawer-${width}.png`})
  await page.getByRole('button',{name:'Continue demo',exact:true}).click();await visibleAction(page,'Submit my receipt');assert.equal(await page.getByRole('button',{name:'Submit my receipt',exact:true}).isDisabled(),true)
  await page.getByRole('button',{name:'Use a sample receipt',exact:true}).click();await page.getByRole('button',{name:'Submit my receipt',exact:true}).click();await visibleAction(page,'View my pickup ticket')
  await page.getByRole('button',{name:'View my pickup ticket',exact:true}).click();await page.getByText('RECEIPT UNDER REVIEW',{exact:true}).waitFor()
  assert.equal(await page.evaluate(()=>localStorage.getItem('customer_phone')),'60123456789')
  assert.equal(await page.evaluate(()=>JSON.stringify(localStorage).includes('history-test-123')),false,'No plaintext password stored')
  await page.getByRole('link',{name:'All transactions',exact:true}).click();await page.getByLabel('History password',{exact:true}).waitFor();assert.equal(await page.getByRole('table').count(),0,'Protected history stays hidden')
  assert.equal(await page.getByLabel('Mobile number',{exact:true}).inputValue(),'60123456789')
  await page.getByLabel('History password',{exact:true}).fill('wrong-password');await page.getByRole('button',{name:'Unlock transactions',exact:true}).click();await page.getByRole('alert').filter({hasText:'Incorrect history password'}).waitFor()
  await page.getByLabel('History password',{exact:true}).fill('history-test-123');await page.getByRole('button',{name:'Unlock transactions',exact:true}).click();await page.getByRole('table').waitFor();assert.equal(await page.getByRole('row').count(),2)
  await page.locator('.history-privacy summary').click();await page.getByLabel('Current password',{exact:true}).fill('history-test-123');await page.getByRole('button',{name:'Remove password',exact:true}).click();await page.getByRole('status').filter({hasText:'Password removed'}).waitFor()
  await page.reload();await page.getByRole('table').waitFor();assert.equal(await page.getByLabel('History password',{exact:true}).count(),0)
  await page.screenshot({path:`test-results/history-table-${width}.png`})
  // Switching the lookup number immediately hides the previous customer's records.
  await page.getByLabel('Mobile number',{exact:true}).fill('0129999999');assert.equal(await page.getByRole('table').count(),0);await page.getByRole('button',{name:'View transactions',exact:true}).click();await page.getByRole('heading',{name:'No transactions found.',exact:true}).waitFor()
  // An unprotected customer can resume an unfinished receipt upload after a reload.
  await page.goto(base);await page.getByRole('button',{name:'Add The Everyday Flask',exact:true}).click();await page.getByRole('button',{name:'LOCK MY BOTTLE'}).click()
  await page.getByLabel('Malaysian mobile number').fill('0128888888');await page.getByLabel('What should we write on your bag?').fill('No Password')
  await page.getByRole('button',{name:'Continue to payment',exact:true}).click();await page.getByRole('button',{name:'Continue demo',exact:true}).waitFor();await page.getByRole('button',{name:'Close checkout',exact:true}).click()
  await page.goto(new URL('/drop',base).href);await page.getByRole('table').waitFor();await page.getByRole('link',{name:/View receipt #D/}).click();await page.getByRole('button',{name:'Upload payment receipt',exact:true}).click()
  await page.getByRole('button',{name:'Use a sample receipt',exact:true}).click();await page.getByRole('button',{name:'Submit my receipt',exact:true}).click();await page.getByRole('button',{name:'View my pickup ticket',exact:true}).click();await page.getByText('RECEIPT UNDER REVIEW',{exact:true}).waitFor()
  await page.getByRole('link',{name:'All transactions',exact:true}).click();await page.getByRole('table').waitFor();assert.equal(await page.getByRole('row').count(),2,'Resumed uploads do not duplicate transactions')
  if(width===375) assert.equal(await page.locator('.transaction-table').evaluate(e=>e.scrollWidth>e.clientWidth+1),false,'Mobile table shows its receipt action without horizontal scrolling')
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[])
  await context.close();console.log(`PASS: visible checkout actions, receipt submission, phone persistence, protected and unprotected history at ${width}x${height}`)
 }
}finally {await browser.close()}
