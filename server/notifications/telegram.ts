import { isLocalHostname } from '../../shared/settings'
export type TelegramConfig = { botToken: string; chatId: string }
export type NewOrderAlert = {
  token?: string; tag: string; customerName: string; scheduleId: string; total: number; remarks: string | null
  items: { name: string; size: string; quantity: number }[]
}
const line = (value: string) => value.replace(/\s+/g, ' ').trim()
export function telegramOrderMessage(order: NewOrderAlert, siteUrl = '', kind: 'created' | 'receipt' = 'created', allowLocalHttp = false) {
  const items = order.items.slice(0, 20).map(item => `${item.quantity} × ${line(item.name)} (${line(item.size)})`)
  if (order.items.length > 20) items.push(`…and ${order.items.length - 20} more items`)
  const parts = [`${kind === 'receipt' ? 'Payment receipt submitted' : 'New customer order'} ${order.tag}`, `Customer: ${line(order.customerName)}`, `Drop: ${order.scheduleId}`, '', ...items, '', `Total: RM ${(order.total / 100).toFixed(2)}`, kind === 'receipt' ? 'Payment: Receipt received — awaiting your review' : 'Payment: Awaiting payment']
  if (order.remarks) parts.push(`Remarks: ${line(order.remarks)}`)
  if (kind === 'receipt') parts.push('Stock stays reserved while awaiting review.')
  try {
    const admin = new URL('/admin/calendar', siteUrl)
    if (admin.protocol === 'https:' || allowLocalHttp && admin.protocol === 'http:' && isLocalHostname(admin.hostname)) {
      if (order.token) {
        admin.searchParams.set('order', order.token); admin.searchParams.set('date', order.scheduleId)
        const ticket = new URL('/drop', siteUrl); ticket.searchParams.set('t', order.token)
        parts.push('', `Order ticket: ${ticket}`)
      }
      parts.push(`${kind === 'receipt' ? 'Review receipt' : 'Open admin'}: ${admin}`)
    }
  } catch { /* A configured public HTTPS origin enables notification links. */ }
  return Array.from(parts.join('\n')).slice(0, 4000).join('')
}
export class TelegramDeliveryError extends Error {
  constructor(message: string, public retryAfter = 0) { super(message) }
}
export async function sendTelegramMessage(config: TelegramConfig, message: string, request: typeof fetch = fetch) {
  let response: Response
  try {
    response = await request(`https://api.telegram.org/bot${config.botToken}/sendMessage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: config.chatId, text: message, link_preview_options: { is_disabled: true } }),
      signal: AbortSignal.timeout(10_000),
    })
  } catch { throw new TelegramDeliveryError('Telegram connection failed or timed out.') }
  let body: { ok?: boolean; result?: { message_id?: number }; parameters?: { retry_after?: number } }
  try { body = await response.json() } catch { throw new TelegramDeliveryError(`Telegram returned an invalid response (HTTP ${response.status}).`) }
  if (!response.ok || body.ok !== true || !Number.isSafeInteger(body.result?.message_id)) {
    const wait = Number(body.parameters?.retry_after)
    throw new TelegramDeliveryError(`Telegram rejected the alert (HTTP ${response.status}).`, Number.isFinite(wait) ? Math.min(3600, Math.max(0, wait)) : 0)
  }
  return body.result!.message_id!
}
export function telegramRetrySeconds(attempt: number, retryAfter = 0) {
  return Math.max(Math.min(900, 10 * 2 ** Math.min(7, Math.max(0, attempt - 1))), retryAfter)
}
