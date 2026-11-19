import test from 'node:test'
import assert from 'node:assert/strict'
import { telegramOrderMessage, sendTelegramMessage, TelegramDeliveryError, telegramRetrySeconds } from '../server/notifications/telegram'
const order = { tag: '#A01', customerName: '<Customer>\nNext line', scheduleId: '2026-11-18', total: 1800, remarks: 'Leave it frozen', items: [{ name: 'Tebu 1 · Kecik', size: '500ml', quantity: 3 }] }
test('new-order alerts distinguish reservations from payment and require a configured HTTPS origin for links', () => {
  const message = telegramOrderMessage(order, 'https://tebu.example')
  assert.ok(message.includes('Customer: <Customer> Next line'))
  assert.ok(message.includes('3 × Tebu 1 · Kecik (500ml)'))
  assert.ok(message.includes('Total: RM 18.00'))
  assert.ok(message.includes('Payment: Awaiting payment'))
  assert.ok(message.includes('https://tebu.example/admin/calendar'))
  assert.equal(message.includes('/drop?t='), false)
  assert.equal(telegramOrderMessage(order, 'javascript:alert(1)').includes('Open admin:'), false)
  assert.ok(Array.from(telegramOrderMessage({ ...order, remarks: '🧃'.repeat(5000) })).length <= 4000)
})
test('receipt alerts carry a ticket and exact authenticated review link without exposing private media', () => {
  const message = telegramOrderMessage({ ...order, token: 'private-ticket' }, 'https://tebu.example', 'receipt')
  assert.ok(message.startsWith('Payment receipt submitted #A01'))
  assert.ok(message.includes('Stock stays reserved while awaiting review.'))
  assert.ok(message.includes('Order ticket: https://tebu.example/drop?t=private-ticket'))
  const review = new URL(message.split('Review receipt: ')[1]!)
  assert.equal(review.pathname, '/admin/calendar')
  assert.equal(review.searchParams.get('order'), 'private-ticket')
  assert.equal(review.searchParams.get('date'), order.scheduleId)
  assert.equal(message.includes('/api/media/'), false)
  assert.equal(message.includes('Awaiting payment'), false)
})
test('Telegram messages use plain text JSON and suppress previews', async () => {
  let payload: any
  const request: typeof fetch = async (url, options) => {
    assert.equal(String(url), 'https://api.telegram.org/botfixture-token/sendMessage')
    payload = JSON.parse(String(options?.body))
    return new Response(JSON.stringify({ ok: true, result: { message_id: 42 } }))
  }
  assert.equal(await sendTelegramMessage({ botToken: 'fixture-token', chatId: '-100123' }, '<plain text>', request), 42)
  assert.deepEqual(payload, { chat_id: '-100123', text: '<plain text>', link_preview_options: { is_disabled: true } })
})
test('delivery errors keep credentials out of stored errors and respect rate limits', async () => {
  await assert.rejects(() => sendTelegramMessage({ botToken: 'secret-token', chatId: '1' }, 'order', async () => { throw new Error('https://api.telegram.org/botsecret-token/sendMessage') }), error => error instanceof TelegramDeliveryError && !error.message.includes('secret-token'))
  await assert.rejects(() => sendTelegramMessage({ botToken: 'fixture-token', chatId: '1' }, 'order', async () => new Response(JSON.stringify({ ok: false, parameters: { retry_after: 35 } }), { status: 429 })), error => error instanceof TelegramDeliveryError && error.retryAfter === 35)
  assert.equal(telegramRetrySeconds(1), 10)
  assert.equal(telegramRetrySeconds(2), 20)
  assert.equal(telegramRetrySeconds(1, 35), 35)
  assert.equal(telegramRetrySeconds(100), 900)
})

test('LAN links work only when explicitly enabled for development', () => {
  const receipt = { ...order, token: 'private-ticket' }
  assert.ok(telegramOrderMessage(receipt, 'http://192.168.1.23:3000', 'receipt', true).includes('Review receipt: http://192.168.1.23:3000/'))
  assert.equal(telegramOrderMessage(receipt, 'http://192.168.1.23:3000', 'receipt').includes('Review receipt:'), false)
  assert.equal(telegramOrderMessage(receipt, 'http://public.example', 'receipt', true).includes('Review receipt:'), false)
  assert.equal(telegramOrderMessage(receipt, 'http://192.168.attacker.example', 'receipt', true).includes('Review receipt:'), false)
})
