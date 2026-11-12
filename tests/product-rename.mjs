import 'dotenv/config'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'
import pg from 'pg'

// Exercise the upgrade against historical data in an isolated database.
if (!process.env.NUXT_DATABASE_URL) throw new Error('Set NUXT_DATABASE_URL first.')
const name = `tebu_rename_test_${randomBytes(8).toString('hex')}`
const url = new URL(process.env.NUXT_DATABASE_URL)
url.pathname = `/${name}`
const root = new pg.Client({ connectionString: process.env.NUXT_DATABASE_URL })
const database = new pg.Client({ connectionString: url.toString() })
const migration = '202611120001_rename_bottle_products'
let created = false
try {
  await root.connect()
  await root.query(`CREATE DATABASE "${name}"`)
  created = true
  await database.connect()
  const directories = (await readdir('prisma/migrations', { withFileTypes: true })).filter(entry => entry.isDirectory()).map(entry => entry.name).sort()
  for (const directory of directories.filter(directory => directory < migration)) {
    await database.query(await readFile(`prisma/migrations/${directory}/migration.sql`, 'utf8'))
  }
  await database.query(`
    UPDATE products SET price = 725 WHERE id = 'flask';
    UPDATE products SET price = 1250, active = false WHERE id = 'jug';
    INSERT INTO customers (id, name, token_hash) VALUES ('00000000-0000-4000-8000-000000000001', 'Existing customer', 'fixture');
    INSERT INTO schedules (id, capacity, flask_capacity, jug_capacity) VALUES ('2026-11-01', 17, 12, 5);
    INSERT INTO orders (id, token, request_id, customer_id, schedule_id, sequence, tag, cart, bottles, total, status, expires_at)
    VALUES ('00000000-0000-4000-8000-000000000002', 'fixture', '00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000001', '2026-11-01', 1, '#A01', '{"flask":2,"jug":1,"asam":1,"limau":2}', 3, 2600, 'collected', now());
    INSERT INTO order_items (order_id, product_id, quantity, unit_price) VALUES
    ('00000000-0000-4000-8000-000000000002', 'flask', 2, 600),
    ('00000000-0000-4000-8000-000000000002', 'jug', 1, 1100),
    ('00000000-0000-4000-8000-000000000002', 'asam', 1, 100),
    ('00000000-0000-4000-8000-000000000002', 'limau', 2, 100);
    INSERT INTO harvests (date, type, quantity, flask_qty, jug_qty) VALUES ('2026-11-01', 'Tebu 1', 10, 15, 8);
  `)
  await database.query(await readFile(`prisma/migrations/${migration}/migration.sql`, 'utf8'))
  const catalog = (await database.query('SELECT id, name, size, description, price, active FROM products ORDER BY sort_order')).rows
  assert.deepEqual(catalog.slice(0, 2), [
    { id: 'kecik', name: 'Botol Kecik', size: '500ml', description: 'Kecik muat beg.', price: 725, active: true },
    { id: 'besar', name: 'Botol Besar', size: '1l', description: 'Bawak balik rumah.', price: 1250, active: false },
  ])
  assert.deepEqual(catalog.slice(2).map(row => row.id), ['asam', 'limau'])
  assert.deepEqual((await database.query('SELECT cart, bottles, total, status FROM orders')).rows[0], {
    cart: { kecik: 2, besar: 1, asam: 1, limau: 2 }, bottles: 3, total: 2600, status: 'collected',
  })
  assert.deepEqual((await database.query('SELECT product_id, quantity, unit_price FROM order_items ORDER BY product_id')).rows, [
    { product_id: 'asam', quantity: 1, unit_price: 100 }, { product_id: 'besar', quantity: 1, unit_price: 1100 },
    { product_id: 'kecik', quantity: 2, unit_price: 600 }, { product_id: 'limau', quantity: 2, unit_price: 100 },
  ])
  assert.deepEqual((await database.query('SELECT capacity, kecik_capacity, besar_capacity FROM schedules')).rows[0], { capacity: 17, kecik_capacity: 12, besar_capacity: 5 })
  assert.deepEqual((await database.query('SELECT kecik_qty, besar_qty FROM harvests')).rows[0], { kecik_qty: 15, besar_qty: 8 })
  for (const query of ["UPDATE products SET id = 'flask' WHERE id = 'kecik'", 'UPDATE harvests SET kecik_qty = -1', 'UPDATE harvests SET besar_qty = -1', 'UPDATE schedules SET kecik_capacity = -1', 'UPDATE schedules SET besar_capacity = -1']) {
    await assert.rejects(database.query(query), error => error.code === '23514')
  }
  console.log('PASS: product rename preserves historical carts, item prices, totals, stock, capacity, and constraints.')
} finally {
  await database.end()
  if (created) await root.query(`DROP DATABASE "${name}" WITH (FORCE)`)
  await root.end()
}
