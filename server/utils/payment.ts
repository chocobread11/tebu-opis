import type { Prisma } from '../../generated/prisma/client'
import type { PaymentStatus } from '../../shared/payment'

export function paymentFilter(status: PaymentStatus): Prisma.OrderWhereInput {
  if (status === 'rejected') return { status: 'rejected' }
  if (status === 'review') return { status: 'pending_review', manualPaymentStatus: null }
  if (status === 'unpaid') return { status: { not: 'rejected' }, OR: [{ manualPaymentStatus: 'unpaid' }, { manualPaymentStatus: null, status: 'pending_payment' }] }
  return { status: { in: ['confirmed', 'ready', 'collected'] }, OR: [{ manualPaymentStatus: null }, { manualPaymentStatus: 'paid' }] }
}
