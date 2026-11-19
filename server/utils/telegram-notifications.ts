import type { Prisma } from '../../generated/prisma/client'
import { telegramOrderMessage, sendTelegramMessage, TelegramDeliveryError, telegramRetrySeconds, type NewOrderAlert } from '../notifications/telegram'
export function telegramAvailable() {
  const config = useRuntimeConfig()
  return String(config.public.demo) !== 'true' && !!String(config.telegram.botToken || '').trim()
}
export async function queueTelegramOrder(tx: Prisma.TransactionClient, orderId: string, order: NewOrderAlert, receiptId?: string) {
  if (!telegramAvailable() || !receiptId) return
  const settings = await shopSettings(tx)
  if (!settings.telegramEnabled || !settings.telegramChatId) return
  const event = receiptId ? `receipt:${receiptId}` : 'created'
  await tx.telegramNotification.upsert({ where: { orderId_event: { orderId, event } }, update: {}, create: { orderId, event, message: telegramOrderMessage(order, settings.siteUrl, receiptId ? 'receipt' : 'created', import.meta.dev) } })
}
let running: Promise<void> | undefined
export function dispatchTelegramNotifications() {
  if (!telegramAvailable()) return Promise.resolve()
  // One dispatcher per process; row leases also protect concurrent replicas and restarts.
  if (!running) running = deliverBatch().catch(() => { console.error('[Telegram] Notification worker failed; queued alerts will be retried.') }).finally(() => { running = undefined })
  return running
}
export function waitForTelegramNotifications() { return running || Promise.resolve() }
async function deliverBatch() {
  for (let count = 0; count < 10; count++) {
    const settings = await shopSettings()
    if (!settings.telegramEnabled || !settings.telegramChatId) return
    const job = await db().$transaction(async tx => {
      const rows = await tx.$queryRaw<{ order_id: string; event: string }[]>`SELECT order_id,event FROM telegram_notifications WHERE event LIKE 'receipt:%' AND sent_at IS NULL AND next_attempt_at <= now() AND (lease_until IS NULL OR lease_until <= now()) ORDER BY next_attempt_at, created_at LIMIT 1 FOR UPDATE SKIP LOCKED`
      if (!rows[0]) return null
      return tx.telegramNotification.update({ where: { orderId_event: { orderId: rows[0].order_id, event: rows[0].event } }, data: { attempts: { increment: 1 }, leaseUntil: new Date(Date.now() + 60_000) } })
    })
    if (!job) return
    try {
      const messageId = await sendTelegramMessage({ botToken: String(useRuntimeConfig().telegram.botToken).trim(), chatId: settings.telegramChatId }, job.message)
      await db().telegramNotification.updateMany({ where: { orderId: job.orderId, event: job.event, attempts: job.attempts, sentAt: null }, data: { sentAt: new Date(), messageId, leaseUntil: null, lastError: null } })
    } catch (error) {
      const safeError = error instanceof TelegramDeliveryError ? error.message : 'Telegram delivery could not be recorded.'
      const seconds = telegramRetrySeconds(job.attempts, error instanceof TelegramDeliveryError ? error.retryAfter : 0)
      await db().telegramNotification.updateMany({ where: { orderId: job.orderId, event: job.event, attempts: job.attempts, sentAt: null }, data: { leaseUntil: null, nextAttemptAt: new Date(Date.now() + seconds * 1000), lastError: safeError } })
    }
  }
}
