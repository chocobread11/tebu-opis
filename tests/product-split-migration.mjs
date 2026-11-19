import 'dotenv/config'
import assert from 'node:assert/strict'
import {readdir, readFile} from 'node:fs/promises'
import pg from 'pg'
const name=`tebu_split_test_${Date.now()}`,url=new URL(process.env.NUXT_DATABASE_URL);url.pathname=`/${name}`
const root=new pg.Client({connectionString:process.env.NUXT_DATABASE_URL}),sql=new pg.Client({connectionString:url.toString()})
let created=false
try {
 await root.connect();await root.query(`CREATE DATABASE "${name}"`);created=true;await sql.connect()
 const last='202611160002_separate_tebu_products',all=(await readdir('prisma/migrations')).filter(n=>n!=='migration_lock.toml').sort(),migrations=all.slice(0,all.indexOf(last))
 assert.equal(last,'202611160002_separate_tebu_products')
 for(const migration of migrations)await sql.query(await readFile(`prisma/migrations/${migration}/migration.sql`,'utf8'))
 await sql.query("UPDATE cane_varieties SET name='Garden Green' WHERE id='tebu-2'")
 await sql.query("INSERT INTO schedules(id) VALUES('2026-11-17')")
 const customer=(await sql.query("INSERT INTO customers(name,phone,token_hash) VALUES('History Buyer','60129999999','fixture') RETURNING id")).rows[0].id
 for(const [i,variety] of ['tebu-1','tebu-2'].entries()) {
  const order=(await sql.query(`INSERT INTO orders(token,request_id,customer_id,schedule_id,sequence,tag,cart,bottles,total,status,expires_at,variety_id,variety_name) VALUES($1,gen_random_uuid(),$2,'2026-11-17',$3,'#A01','{"kecik":2,"besar":1,"asam":1}',3,2475,'confirmed',now(),$4,$5) RETURNING id`,[`history-${i}`,customer,i+1,variety,i?'Garden Green':'Tebu 1'])).rows[0].id
  await sql.query("INSERT INTO order_items(order_id,product_id,quantity,unit_price,name,size,kind,space_cost) VALUES($1,'kecik',2,625,'Old small label','500ml','bottle',1),($1,'besar',1,1125,'Old large label','1l','bottle',2),($1,'asam',1,100,'Asam Boi','pouch','addon',0)",[order])
  await sql.query("INSERT INTO harvests(date,type,quantity,variety_id,kecik_qty,besar_qty) VALUES('2026-11-15',$1,10,$2,20,10)",[variety,variety])
  await sql.query("INSERT INTO stock_entries(product_id,variety_id,date,quantity,note) VALUES('kecik',$1,'2026-11-15',5,'Existing restock')",[variety])
 }
 await sql.query(await readFile(`prisma/migrations/${last}/migration.sql`,'utf8'))
 const products=(await sql.query("SELECT id,name,variety_tracked FROM products WHERE kind='bottle' ORDER BY id")).rows
 assert.equal(products.length,4);assert.ok(products.every(p=>!p.variety_tracked));assert.equal(products.find(p=>p.id==='tebu-2-kecik').name,'Garden Green · Kecik')
 const orders=(await sql.query('SELECT cart,total,variety_id FROM orders ORDER BY sequence')).rows
 assert.deepEqual(orders[0].cart,{kecik:2,besar:1,asam:1});assert.deepEqual(orders[1].cart,{'tebu-2-kecik':2,'tebu-2-besar':1,asam:1});assert.ok(orders.every(o=>o.total===2475&&o.variety_id===null))
 const items=(await sql.query('SELECT product_id,name,size,unit_price,space_cost FROM order_items ORDER BY product_id')).rows
 assert.equal(items.find(i=>i.product_id==='tebu-2-kecik').name,'Garden Green · Old small label');assert.equal(items.find(i=>i.product_id==='tebu-2-kecik').unit_price,625);assert.equal(items.find(i=>i.product_id==='tebu-2-besar').space_cost,2)
 const quantities=(await sql.query('SELECT product_id,sum(quantity)::int AS quantity FROM stock_entries GROUP BY product_id')).rows
 for(const p of products)assert.equal(quantities.find(q=>q.product_id===p.id).quantity,p.id.endsWith('besar')?10:25)
 assert.equal((await sql.query('SELECT count(*)::int AS count FROM harvests')).rows[0].count,2)
 assert.equal((await sql.query('SELECT count(*)::int AS count FROM stock_entries WHERE source_harvest_id IS NOT NULL')).rows[0].count,4)
 assert.equal((await sql.query('SELECT count(*)::int AS count FROM stock_entries WHERE variety_id IS NOT NULL')).rows[0].count,0)
 console.log('PASS migration: four products, custom variety names, both historical carts, original line prices and box spaces, restock quantities and harvest history preserved.')
} finally {await sql.end().catch(()=>{});if(created)await root.query(`DROP DATABASE "${name}" WITH (FORCE)`);await root.end()}
