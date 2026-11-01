import type { Order } from '../../generated/prisma/client'
import type { Cart, Ticket } from '../../shared/domain'
export async function toTicket(order: Order, admin = false): Promise<Ticket> {
  const [customer, schedule, items] = await Promise.all([
    db().customer.findUniqueOrThrow({ where: { id: order.customerId } }),
    db().schedule.findUnique({ where: { id: order.scheduleId } }),
    db().orderItem.findMany({ where: { orderId: order.id }, include: { product: true }, orderBy: { product: { sortOrder: 'asc' } } }),
  ])
  return { manualPaymentStatus: order.manualPaymentStatus as Ticket['manualPaymentStatus'] ?? undefined, varietyId: order.varietyId ?? undefined, varietyName: order.varietyName ?? undefined, items: items.map(item => ({ productId: item.productId, name: item.product.name, size: item.product.size, quantity: item.quantity, unitPrice: item.unitPrice })), token: order.token, tag: order.tag, name: order.customerName ?? customer.name, phone: admin ? customer.phone ?? '' : '', scheduleId: order.scheduleId, cart: order.cart as Cart, total: order.total, status: order.status as Ticket['status'], packed: order.packed, notified: order.notified, createdAt: order.createdAt.toISOString(), expiresAt: order.expiresAt.toISOString(), receiptId: admin ? order.receiptId ?? undefined : undefined, photoUrl: schedule?.photoId ? `/api/media/${schedule.photoId}` : undefined }
}
