import { pgTable, text, timestamp, integer, boolean, jsonb, uuid, uniqueIndex, check } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import type { Cart } from '../../shared/domain'
export const customers = pgTable('customers', {
  id: uuid('id').defaultRandom().primaryKey(), phone: text('phone').notNull().unique(), name: text('name').notNull(), tokenHash: text('token_hash').notNull().unique(), createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, t => [check('phone_format', sql`${t.phone} ~ '^601[0-9]{8,9}$'`)])
export const schedules = pgTable('schedules', {
  id: text('id').primaryKey(), capacity: integer('capacity').notNull().default(30), open: boolean('open').notNull().default(true), photoId: uuid('photo_id'), droppedAt: timestamp('dropped_at', { withTimezone: true }),
}, t => [check('positive_capacity', sql`${t.capacity} > 0`)])
export const orders = pgTable('orders', {
  id: uuid('id').defaultRandom().primaryKey(), token: text('token').notNull().unique(), requestId: uuid('request_id').notNull().unique(), customerId: uuid('customer_id').references(() => customers.id).notNull(), scheduleId: text('schedule_id').references(() => schedules.id).notNull(), sequence: integer('sequence').notNull(), tag: text('tag').notNull(), cart: jsonb('cart').$type<Cart>().notNull(), bottles: integer('bottles').notNull(), total: integer('total').notNull(), status: text('status', { enum: ['pending_payment', 'pending_review', 'confirmed', 'ready', 'collected', 'rejected'] }).default('pending_payment').notNull(), receiptId: uuid('receipt_id'), packed: boolean('packed').default(false).notNull(), notified: boolean('notified').default(false).notNull(), expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(), createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, t => [uniqueIndex('schedule_sequence').on(t.scheduleId, t.sequence), check('order_total_positive', sql`${t.total} > 0`), check('order_bottles_positive', sql`${t.bottles} > 0`), check('order_status', sql`${t.status} in ('pending_payment','pending_review','confirmed','ready','collected','rejected')`)])
export const media = pgTable('media', {
  id: uuid('id').defaultRandom().primaryKey(), filename: text('filename').notNull(), kind: text('kind', { enum: ['receipt', 'freezer'] }).notNull(), orderId: uuid('order_id').references(() => orders.id), scheduleId: text('schedule_id').references(() => schedules.id), createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})
