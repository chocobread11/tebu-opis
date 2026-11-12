import QRCode from 'qrcode'
import { networkInterfaces } from 'node:os'

export default defineEventHandler(async event => {
  const customer = await requireCustomer(event)
  const order = await findOrder(getRouterParam(event, 'token') || '')
  if (order.customerId !== customer.id) throw createError({ statusCode: 403, message: 'This order belongs to another customer.' })
  if (order.status !== 'pending_payment' || order.expiresAt <= new Date()) throw createError({ statusCode: 409, message: 'This order is no longer accepting receipts.' })
  const url = new URL('/receipt', getRequestURL(event).origin)
  if (import.meta.dev && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
    const address = Object.values(networkInterfaces()).flat().find(address => address?.family === 'IPv4' && !address.internal && !address.address.startsWith('169.254.'))
    if (address) url.hostname = address.address
  }
  url.searchParams.set('t', order.token)
  // Keep the upload credential out of request URLs and server access logs.
  url.hash = receiptUploadSignature(order, customer.tokenHash)
  return { url: url.toString(), qr: await QRCode.toDataURL(url.toString(), { width: 300, margin: 4, errorCorrectionLevel: 'M' }), expiresAt: order.expiresAt.toISOString() }
})
