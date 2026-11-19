import QRCode from 'qrcode'
import { receiptOrigin } from '../../../utils/receipt-origin'

export default defineEventHandler(async event => {
  const order = await findOrder(getRouterParam(event, 'token') || '')
  await authorizeReceipt(event, order)
  const customer = await db().customer.findUniqueOrThrow({ where: { id: order.customerId } })
  if (order.status !== 'pending_payment' || order.expiresAt <= new Date()) throw createError({ statusCode: 409, message: 'This order is no longer accepting receipts.' })
  let origin: string
  try { origin = receiptOrigin(getRequestURL(event, { xForwardedHost: true, xForwardedProto: true }).origin, (await shopSettings()).siteUrl, import.meta.dev) }
  catch { throw createError({ statusCode: 500, message: 'Receipt upload URL is not configured correctly. Check the website URL in Settings.' }) }
  const url = new URL(`/receipt/${order.token}`, origin)
  // Keep the upload credential out of request URLs and server access logs.
  url.hash = receiptUploadSignature(order, customer.tokenHash)
  return { url: url.toString(), qr: await QRCode.toDataURL(url.toString(), { width: 300, margin: 4, errorCorrectionLevel: 'M' }), expiresAt: order.expiresAt.toISOString() }
})
