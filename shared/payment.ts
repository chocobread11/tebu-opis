import type { Ticket } from './domain'

export const paymentStatuses = ['unpaid', 'review', 'paid', 'rejected'] as const
export type PaymentStatus = typeof paymentStatuses[number]
export const paymentLabels: Record<PaymentStatus, string> = { unpaid: 'Unpaid', review: 'To review', paid: 'Paid', rejected: 'Rejected' }
type PaymentOrder = { status: string; manualPaymentStatus?: string | null; receiptId?: string | null; fulfilled?: boolean; refundedTotal?: number }

export function paymentStatus(order: PaymentOrder): PaymentStatus {
  if (order.status === 'rejected') return 'rejected'
  if (order.manualPaymentStatus) return order.manualPaymentStatus === 'paid' ? 'paid' : 'unpaid'
  return order.status === 'pending_payment' ? 'unpaid' : order.status === 'pending_review' ? 'review' : 'paid'
}
export function paymentLabel(order: PaymentOrder) {
  return order.manualPaymentStatus && order.status === 'rejected' ? 'Cancelled' : paymentLabels[paymentStatus(order)]
}
export function paymentOptions(order: PaymentOrder): PaymentStatus[] {
  if(order.refundedTotal)return []
  if(!order.manualPaymentStatus&&(order.fulfilled||order.status==='collected'))return ['paid']
  if (order.manualPaymentStatus) return order.status === 'rejected' ? [] : ['unpaid', 'paid']
  return paymentStatuses.filter(status => status !== 'review' || !!order.receiptId || order.status === 'pending_review')
}
export function paymentChanges(order: PaymentOrder, next: PaymentStatus, now = new Date()): Partial<Pick<Ticket, 'status' | 'manualPaymentStatus' | 'packed' | 'notified' | 'expiresAt'>> {
  if (!paymentOptions(order).includes(next)) throw new Error('This payment status is not available for this order.')
  if (paymentStatus(order) === next) return {}
  if (order.manualPaymentStatus) return { manualPaymentStatus: next as 'paid' | 'unpaid' }
  if (next === 'paid') return { status: ['ready', 'collected'].includes(order.status) ? order.status as Ticket['status'] : 'confirmed' }
  return {
    status: next === 'unpaid' ? 'pending_payment' : next === 'review' ? 'pending_review' : 'rejected', packed: false, notified: false,
    ...(next === 'unpaid' ? { expiresAt: new Date(now.getTime() + 20 * 60_000).toISOString() } : {}),
  }
}
