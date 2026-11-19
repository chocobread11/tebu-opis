export const orderRemarksMaxLength = 500

export function reservationExpired(order: { status: string; expiresAt?: string | null }, now = Date.now()) {
  return order.status === 'pending_payment' && !!order.expiresAt && new Date(order.expiresAt).getTime() <= now
}
export function reservationSeconds(order: { expiresAt?: string | null }, now = Date.now()) {
  return order.expiresAt ? Math.max(0, Math.ceil((new Date(order.expiresAt).getTime() - now) / 1000)) : 0
}

export function canDeleteOrder(order: { status: string; fulfilled?: boolean; refundedTotal?: number; manualPaymentStatus?: string | null }) {
  return !order.fulfilled && order.status !== 'collected' && !order.refundedTotal && !(!order.manualPaymentStatus && ['confirmed','ready'].includes(order.status)) && !(order.manualPaymentStatus === 'paid' && order.status !== 'rejected')
}
