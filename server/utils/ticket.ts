import type { Order, Prisma } from '../../generated/prisma/client'
import type { Cart, Ticket } from '../../shared/domain'
export async function toTicket(order: Order, admin = false, client: Pick<Prisma.TransactionClient, 'customer' | 'schedule' | 'orderItem'> = db()): Promise<Ticket> {
  const [customer, schedule, items] = await Promise.all([
    client.customer.findUniqueOrThrow({ where: { id: order.customerId } }),
    client.schedule.findUnique({ where: { id: order.scheduleId } }),
    client.orderItem.findMany({ where: { orderId: order.id }, include: { product: true }, orderBy: { product: { sortOrder: 'asc' } } }),
  ])
  return { fulfilled: order.fulfilled, refundedTotal: order.refundedTotal, cancellationReason: order.cancellationReason ?? undefined, manualPaymentStatus: order.manualPaymentStatus as Ticket['manualPaymentStatus'] ?? undefined, varietyId: order.varietyId ?? undefined, varietyName: order.varietyName ?? undefined, items: items.map(item => ({ productId: item.productId, name: item.name ?? item.product.name, size: item.size ?? item.product.size, kind: item.kind ?? item.product.kind, spaceCost: item.kind ? item.spaceCost : item.product.spaceCost, quantity: item.quantity, unitPrice: item.unitPrice })), token: order.token, tag: order.tag, name: order.customerName ?? customer.name, remarks: order.remarks ?? undefined, phone: admin ? customer.phone ?? '' : '', scheduleId: order.scheduleId, cart: order.cart as Cart, total: order.total, status: order.status as Ticket['status'], packed: order.packed, notified: order.notified, createdAt: order.createdAt.toISOString(), expiresAt: order.expiresAt.toISOString(), receiptId: admin ? order.receiptId ?? undefined : undefined, photoUrl: schedule?.photoId ? `/api/media/${schedule.photoId}` : undefined }
}
