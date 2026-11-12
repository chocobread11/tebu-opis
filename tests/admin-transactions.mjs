import 'dotenv/config'
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import pg from 'pg'
import { chromium } from 'playwright'

const name = `tebu_archive_test_${Date.now()}`
const url = new URL(process.env.NUXT_DATABASE_URL)
url.pathname = `/${name}`
const root = new pg.Client({ connectionString: process.env.NUXT_DATABASE_URL })
const sql = new pg.Client({ connectionString: url.toString() })
const key = randomBytes(32).toString('hex')
const port = process.env.TEBU_ARCHIVE_TEST_PORT || '3046'
const base = `http://127.0.0.1:${port}`
const uploads = await mkdtemp(join(tmpdir(), 'tebu-archive-'))
const env = { ...process.env, NUXT_DATABASE_URL: url.toString(), NUXT_PUBLIC_DEMO: 'false', NUXT_ADMIN_KEY: key, NUXT_UPLOAD_DIR: uploads, NUXT_UPLOAD_STORAGE: 'local', NITRO_HOST: '127.0.0.1', NITRO_PORT: port }
let server, browser, created = false, output = ''
const token = index => createHash('sha256').update(`archive-test-${index}`).digest('base64url')
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kuala_Lumpur', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
const request = async (path, { auth = true, body, ...options } = {}) => {
  const response = await fetch(base + path, { ...options, headers: { 'X-Forwarded-For': '127.0.0.2', ...(auth ? { Authorization: `Bearer ${key}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined })
  return { status: response.status, data: await response.json() }
}
try {
  await root.connect(); await root.query(`CREATE DATABASE "${name}"`); created = true
  for (const args of [['exec', 'prisma', 'migrate', 'deploy'], ['run', 'db:seed']]) {
    const result = spawnSync('npm', args, { env, encoding: 'utf8' })
    assert.equal(result.status, 0, result.stderr)
  }
  await sql.connect()
  const customerId = randomUUID()
  await sql.query('INSERT INTO customers (id, name, phone, token_hash) VALUES ($1,$2,$3,$4)', [customerId, 'Archive Person', '60129990042', createHash('sha256').update(customerId).digest('hex')])
  for (let index = 0; index < 28; index++) {
    const id = randomUUID(), schedule = `2026-08-${String(index + 1).padStart(2, '0')}`
    await sql.query('INSERT INTO schedules (id, open) VALUES ($1,false) ON CONFLICT DO NOTHING', [schedule])
    await sql.query(`INSERT INTO orders (id, token, request_id, customer_id, schedule_id, sequence, tag, cart, bottles, total, status, expires_at, created_at, variety_id, variety_name) VALUES ($1,$2,$3,$4,$5,1,'#A01',$6,1,600,'confirmed',now(),now() - interval '90 days','tebu-1','Tebu 1')`, [id, token(index), randomUUID(), customerId, schedule, { kecik: 1, besar: 0, asam: 0, limau: 0 }])
    await sql.query("INSERT INTO order_items (order_id, product_id, quantity, unit_price) VALUES ($1,'kecik',1,600)", [id])
    if (index === 27) {
      const mediaId = randomUUID()
      await sql.query("INSERT INTO media (id,filename,kind,order_id) VALUES ($1,'test-receipt.webp','receipt',$2)", [mediaId,id])
      await sql.query('UPDATE orders SET receipt_id=$1, packed=true WHERE id=$2',[mediaId,id])
    }
  }
  await sql.query("UPDATE orders SET manual_payment_status='paid' WHERE token=$1",[token(0)])
  await sql.query("UPDATE orders SET manual_payment_status='unpaid',status='collected',packed=true WHERE token=$1",[token(1)])
  // Today's list includes only confirmed orders; the archive holds every status.
  await sql.query('INSERT INTO schedules (id) VALUES ($1) ON CONFLICT DO NOTHING',[today])
  for (const [index,status] of ['confirmed','pending_payment','pending_review','collected'].entries()) {
    const id=randomUUID()
    const last=(await sql.query('SELECT COALESCE(MAX(sequence),0)::int AS sequence FROM orders WHERE schedule_id=$1',[today])).rows[0].sequence+1
    await sql.query('INSERT INTO orders (id,token,request_id,customer_id,schedule_id,sequence,tag,cart,bottles,total,status,expires_at,packed,variety_id,variety_name) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,1,600,$9,now()+interval \'1 hour\',$10,\'tebu-2\',\'Tebu 2\')',[id,token(100+index),randomUUID(),customerId,today,last,`#A${String(last).padStart(2,'0')}`,{kecik:1,besar:0,asam:0,limau:0},status,status==='collected'])
    await sql.query("INSERT INTO order_items (order_id,product_id,quantity,unit_price) VALUES ($1,'kecik',1,600)",[id])
  }
  const receiptId=randomUUID()
  await writeFile(join(uploads,'review-receipt.webp'),await sharp({create:{width:500,height:700,channels:3,background:'#eee'}}).webp().toBuffer())
  await sql.query("INSERT INTO media (id,filename,kind,order_id) SELECT $1,'review-receipt.webp','receipt',id FROM orders WHERE token=$2",[receiptId,token(102)])
  await sql.query('UPDATE orders SET receipt_id=$1 WHERE token=$2',[receiptId,token(102)])
  server = spawn(process.execPath, ['.output/server/index.mjs'], { env, stdio: ['ignore','pipe','pipe'] })
  server.stdout.on('data', chunk => { output += chunk }); server.stderr.on('data', chunk => { output += chunk })
  for(let attempt=0;attempt<100;attempt++) {
    try { if((await fetch(base+'/api/health')).ok) break } catch {}
    if(server.exitCode !== null) throw new Error(output)
    await new Promise(resolve=>setTimeout(resolve,100))
  }
  for(const [path,method,body] of [['/api/admin/orders','GET'],[`/api/admin/orders/${token(27)}`,'PATCH',{}],[`/api/admin/orders/${token(27)}`,'DELETE']]) assert.equal((await request(path,{auth:false,method,body})).status,401)
  assert.equal((await request('/api/admin/orders?pageSize=999')).status,400)
  assert.equal((await request('/api/admin/orders?paymentStatus=invalid')).status,400)
  assert.equal((await request(`/api/admin/orders/${token(102)}/payment`,{auth:false,method:'PATCH',body:{}})).status,401)
  let result = await request('/api/admin/orders?search=Archive%20Person&pageSize=10')
  assert.equal(result.status,200); assert.equal(result.data.total,32); assert.equal(result.data.orders.length,10)
  for(const [status,count] of [['paid',29],['unpaid',2],['review',1],['rejected',0]]) {
    const filtered=await request(`/api/admin/orders?search=Archive%20Person&paymentStatus=${status}&pageSize=100`)
    assert.equal(filtered.status,200);assert.equal(filtered.data.total,count,`Filter ${status}`)
  }
  assert.equal((await request(`/api/admin/orders?search=Archive%20Person&date=${today}&paymentStatus=review`)).data.total,1)
  const changePayment=(index,paymentStatus,expectedStatus,expectedPaymentStatus)=>request(`/api/admin/orders/${token(index)}/payment`,{method:'PATCH',body:{paymentStatus,expectedStatus,expectedPaymentStatus}})
  result=await changePayment(102,'paid','pending_review','review');assert.equal(result.status,200);assert.equal(result.data.order.status,'confirmed');assert.equal(result.data.order.total,600)
  assert.equal((await changePayment(102,'rejected','pending_review','review')).status,409,'Stale review must not overwrite confirmed payment')
  result=await changePayment(102,'rejected','confirmed','paid');assert.equal(result.status,200)
  await sql.query('UPDATE schedules SET capacity=1 WHERE id=$1',[today])
  assert.equal((await changePayment(102,'paid','rejected','rejected')).status,409,'Payment changes must not oversell capacity')
  assert.equal((await sql.query('SELECT status FROM orders WHERE token=$1',[token(102)])).rows[0].status,'rejected','Capacity failure rolls payment back')
  await sql.query('UPDATE schedules SET capacity=12 WHERE id=$1',[today])
  assert.equal((await changePayment(102,'review','rejected','rejected')).status,200)
  result=await changePayment(1,'paid','collected','unpaid');assert.equal(result.status,200);assert.equal(result.data.order.status,'collected');assert.equal(result.data.order.packed,true);assert.equal(result.data.order.manualPaymentStatus,'paid')
  assert.equal((await changePayment(1,'unpaid','collected','unpaid')).status,409,'Stale manual payment must not overwrite a newer payment')
  assert.equal((await changePayment(1,'unpaid','collected','paid')).status,200)
  assert.equal((await changePayment(101,'review','pending_payment','unpaid')).status,400,'Review requires a receipt')
  console.log('PASS payments: status filters combine with search/date, direct review, manual corrections preserve fulfillment, stale updates rejected, capacity rollback')
  result=await request('/api/admin/orders?date=2026-08-28');assert.equal(result.data.total,1)
  const order=result.data.orders[0]
  const removedId=(await sql.query('SELECT id FROM orders WHERE token=$1',[order.token])).rows[0].id
  const edit={name:'Archive Edited',scheduleId:order.scheduleId,varietyId:order.varietyId,status:order.status,cart:{...order.cart,asam:1}}
  result=await request(`/api/admin/orders/${order.token}`,{method:'PATCH',body:edit});assert.equal(result.status,200,JSON.stringify(result.data));assert.equal(result.data.order.total,700);assert.equal(result.data.order.packed,false)
  // A name-only edit must preserve packing, original prices and customer identity.
  await sql.query('UPDATE orders SET packed=true WHERE token=$1',[order.token])
  result=await request(`/api/admin/orders/${order.token}`,{method:'PATCH',body:{...edit,name:'Archive Renamed'}});assert.equal(result.status,200);assert.equal(result.data.order.packed,true);assert.equal(result.data.order.items.find(item=>item.productId==='kecik').unitPrice,600)
  assert.equal((await sql.query('SELECT name FROM customers WHERE id=$1',[customerId])).rows[0].name,'Archive Person')
  const before=(await sql.query('SELECT total,cart FROM orders WHERE token=$1',[order.token])).rows[0]
  result=await request(`/api/admin/orders/${order.token}`,{method:'PATCH',body:{...edit,cart:{...edit.cart,kecik:1000}}});assert.equal(result.status,409);assert.deepEqual((await sql.query('SELECT total,cart FROM orders WHERE token=$1',[order.token])).rows[0],before)
  result=await request(`/api/admin/orders/${order.token}`,{method:'PATCH',body:{...edit,name:'Archive Renamed',scheduleId:'2026-08-27'}});assert.equal(result.status,200);assert.equal(result.data.order.tag,'#A02')
  result=await request(`/api/admin/orders/${order.token}`,{method:'PATCH',body:{...edit,varietyId:'tebu-2',cart:{kecik:0,besar:0,asam:1,limau:0}}});assert.equal(result.status,400)
  console.log('PASS API: authorization, all-date search, pagination, date filter, edits, price preservation, capacity rollback and date move')
  browser=await chromium.launch({headless:true})
  await mkdir('test-results',{recursive:true})
  for(const width of [320,390,1440]) {
    // Model separate API/mobile/desktop clients so each retains its own rate-limit window.
    const page=await browser.newPage({viewport:{width,height:1000},extraHTTPHeaders:{'X-Forwarded-For':`127.0.0.${width===320?5:width===390?3:4}`}});page.setDefaultTimeout(15000)
    await page.goto(base+'/admin',{waitUntil:'networkidle'});await page.getByLabel('Admin key',{exact:true}).fill(key);await page.getByRole('button',{name:'Open pantry ops'}).click()
    await page.getByRole('heading',{name:'What to pack today'}).waitFor()
    assert.equal(await page.locator('.ops-transactions-table').count(),0)
    assert.equal(await page.locator(`.packing-row[data-token="${token(100)}"]`).count(),1)
    for(const index of [101,102,103])assert.equal(await page.locator(`.packing-row[data-token="${token(index)}"]`).count(),0)
    await page.locator('.packing-list').screenshot({path:`test-results/packing-only-${width}.png`})
    await page.getByRole('link',{name:'Calendar',exact:true}).click()
    await page.getByRole('heading',{name:'Transactions',exact:true}).waitFor()
    await page.getByLabel('Search transactions',{exact:true}).fill('Archive')
    await page.waitForResponse(response=>response.url().includes('/api/admin/orders?') && response.url().includes('search=Archive') && response.status()===200)
    await page.waitForFunction(()=>document.querySelector('.transaction-pagination p')?.textContent?.includes('of 32 transactions'))
    await page.getByLabel('Rows per page',{exact:true}).selectOption('25')
    await page.waitForFunction(()=>document.querySelectorAll('.admin-transaction-history tbody tr').length===25)
    await page.getByRole('button',{name:'Next',exact:true}).click()
    await page.waitForFunction(()=>document.querySelectorAll('.admin-transaction-history tbody tr').length===7)
    await page.getByLabel('Search transactions',{exact:true}).fill('Archive Renamed')
    await page.waitForFunction(()=>document.querySelector('.transaction-pagination p')?.textContent?.includes('of 1 transactions'))
    await page.getByRole('button',{name:/^Edit transaction/}).click()
    const dialog=page.getByRole('dialog');await dialog.getByLabel('Customer name',{exact:true}).fill('Archive UI Updated')
    await dialog.getByRole('button',{name:'Save changes',exact:true}).click();await dialog.waitFor({state:'hidden'})
    await page.getByLabel('Search transactions',{exact:true}).fill('Archive UI Updated')
    await page.getByRole('button',{name:/^Edit transaction/}).waitFor()
    assert.ok((await page.getByRole('link',{name:/^WhatsApp ticket/}).getAttribute('href')).startsWith('https://wa.me/60129990042'))
    if(width===1440) {
      await page.locator('.admin-transaction-history tbody tr').first().locator('time').click()
      await page.getByRole('dialog').getByRole('button',{name:'Delete transaction',exact:true}).click();await page.getByRole('alertdialog').getByRole('button',{name:'Delete transaction',exact:true}).click()
      await page.getByRole('alertdialog').waitFor({state:'hidden'})
      await page.waitForFunction(()=>document.querySelector('.transaction-pagination p')?.textContent?.includes('of 0 transactions'))
    } else {
      // Leave the record in place for the desktop edit/delete pass.
      await page.getByRole('button',{name:/^View transaction/}).focus();await page.keyboard.press('Enter')
      await page.getByRole('dialog').getByRole('button',{name:'Edit transaction',exact:true}).click();await page.getByRole('dialog').getByLabel('Customer name',{exact:true}).fill('Archive Renamed');await page.getByRole('dialog').getByRole('button',{name:'Save changes',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'})
    }
    await page.getByLabel('Search transactions',{exact:true}).fill('Archive Person')
    await page.getByLabel('Payment status',{exact:true}).selectOption('review')
    await page.waitForFunction(()=>document.querySelector('.transaction-pagination p')?.textContent?.includes('of 1 transactions'))
    const reviewRow=page.locator(`.admin-transaction-history tr[data-token="${token(102)}"]`)
    await reviewRow.locator('time').click()
    const details=page.getByRole('dialog')
    await details.getByRole('img',{name:'Customer payment receipt',exact:true}).waitFor()
    assert.ok((await details.getByRole('link',{name:'WhatsApp',exact:true}).getAttribute('href')).includes('wa.me'))
    assert.ok((await details.getByRole('link',{name:'Customer ticket',exact:true}).getAttribute('href')).includes(token(102)))
    await details.screenshot({path:`test-results/payment-detail-${width}.png`})
    await page.keyboard.press('Escape');await details.waitFor({state:'hidden'})
    assert.equal(await reviewRow.getByRole('button',{name:/^View transaction/}).evaluate(element=>element===document.activeElement),true,'Row details restores keyboard focus')
    await reviewRow.getByRole('button',{name:/^Change payment/}).click()
    await page.getByRole('menuitem',{name:'Mark payment paid',exact:true}).click()
    await page.waitForFunction(()=>document.querySelector('.transaction-pagination p')?.textContent?.includes('of 0 transactions'))
    assert.equal(await page.getByRole('dialog').count(),0,'Quick payment change does not open the edit dialog')
    assert.equal(await page.getByRole('alertdialog').count(),0,'Payment confirmation needs no second confirmation')
    assert.equal((await sql.query('SELECT status FROM orders WHERE token=$1',[token(102)])).rows[0].status,'confirmed')
    assert.equal((await changePayment(102,'review','confirmed','paid')).status,200)
    await page.getByLabel('Payment status',{exact:true}).selectOption('unpaid')
    const manualRow=page.locator(`.admin-transaction-history tr[data-token="${token(1)}"]`)
    await manualRow.getByRole('button',{name:/^Change payment/}).click()
    await page.getByRole('menuitem',{name:'Mark payment paid',exact:true}).click()
    await manualRow.waitFor({state:'hidden'})
    const manual=(await sql.query('SELECT manual_payment_status,status,packed FROM orders WHERE token=$1',[token(1)])).rows[0]
    assert.deepEqual(manual,{manual_payment_status:'paid',status:'collected',packed:true})
    assert.equal((await changePayment(1,'unpaid','collected','paid')).status,200)
    await page.getByLabel('Payment status',{exact:true}).selectOption('all')
    await page.getByLabel('Search transactions',{exact:true}).fill('Archive')
    await page.waitForResponse(response=>response.url().includes('/api/admin/orders?') && response.url().includes('search=Archive'))
    await page.waitForFunction(()=>document.querySelector('.admin-transaction-history')?.getAttribute('aria-busy')==='false' && document.querySelectorAll('.admin-transaction-history tbody tr').length>1 && !document.querySelector('.transaction-pagination p')?.textContent?.includes('Loading'))
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)
    if(width<640) assert.equal(await page.locator('.ops-transactions-table>div').evaluate(element=>element.scrollWidth>element.clientWidth+1),false,'Mobile payments and actions fit without horizontal scrolling')
    await page.locator('.admin-transaction-history').evaluate(element=>{element.scrollIntoView({block:'start'});for(const scroller of element.querySelectorAll('.ops-transactions-table, .ops-transactions-table>div'))scroller.scrollLeft=0})
    await page.screenshot({path:`test-results/archive-${width}.png`})
    await page.close();console.log(`PASS UI ${width}px: daily packing only, archive search, page size, pagination, edit${width===1440?', delete':''}, no overflow`)
  }
  assert.equal((await sql.query('SELECT count(*)::int AS n FROM orders WHERE token=$1',[order.token])).rows[0].n,0)
  assert.equal((await sql.query('SELECT count(*)::int AS n FROM media WHERE order_id=$1',[removedId])).rows[0].n,0)
  assert.equal((await request(`/api/orders/${order.token}`)).status,404)
  assert.equal((await sql.query('SELECT count(*)::int AS n FROM order_items WHERE order_id=$1',[removedId])).rows[0].n,0)
  console.log('PASS deletion: order, items, receipt metadata and ticket removed')
} finally {
  if(browser)await browser.close()
  if(server){server.kill('SIGTERM');await new Promise(resolve=>server.once('exit',resolve))}
  await sql.end().catch(()=>{})
  if(created)await root.query(`DROP DATABASE "${name}" WITH (FORCE)`)
  await root.end()
  await rm(uploads,{recursive:true,force:true})
}
