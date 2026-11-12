import { createHmac, timingSafeEqual } from 'node:crypto'
import type { H3Event } from 'h3'
import type { Order } from '../../generated/prisma/client'

export function receiptUploadSignature(order: Pick<Order, 'token' | 'expiresAt'>, customerHash: string) {
  return createHmac('sha256', customerHash).update(`receipt-upload:${order.token}:${order.expiresAt.toISOString()}`).digest('base64url')
}

export async function authorizeReceipt(event: H3Event, order: Order) {
  const signature = getHeader(event, 'authorization')?.match(/^Receipt ([\w-]{43})$/)?.[1]
  if (!signature) {
    const customer = await requireCustomer(event)
    if (customer.id !== order.customerId) throw createError({ statusCode: 403, message: 'This receipt belongs to another customer.' })
    return
  }
  const customer = await db().customer.findUniqueOrThrow({ where: { id: order.customerId } })
  const expected = receiptUploadSignature(order, customer.tokenHash)
  if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) throw createError({ statusCode: 403, message: 'This upload link is invalid.' })
  if (order.expiresAt <= new Date()) throw createError({ statusCode: 410, message: 'This upload link has expired. Contact the operator if you have paid.' })
}
