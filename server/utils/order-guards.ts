import {createError} from 'h3'
import { sameCart, type Cart } from '../../shared/domain'
import { paymentStatus } from '../../shared/payment'
import type { Order } from '../../generated/prisma/client'
export function guardOrderChange(current: Order, next: { status?: string; cart?: Cart; scheduleId?: string }) {
  if (current.fulfilled || current.status === 'collected') {
    if (next.status && next.status !== 'collected' || next.cart && !sameCart(current.cart as Cart, next.cart) || next.scheduleId && next.scheduleId !== current.scheduleId) throw createError({ statusCode: 409, message: 'Collected items stay in the sales log. Record a refund or a stock adjustment for a physical return.' })
  }
  if (current.refundedTotal && (next.cart && !sameCart(current.cart as Cart, next.cart) || next.scheduleId && next.scheduleId !== current.scheduleId)) throw createError({ statusCode: 409, message: 'Orders with refunds keep their original items and date.' })
  if(current.refundedTotal&&next.status&&next.status!==current.status&&next.status!=='rejected')throw createError({statusCode:409,message:'An order with refunds keeps its fulfilment record.'})
  if (next.status === 'rejected' && paymentStatus(current) === 'paid' && current.refundedTotal < current.total) throw createError({ statusCode: 409, message: 'Record the refund before cancelling a paid order.' })
}
