import { guardOrderChange } from '../../../utils/order-guards'
import { z } from 'zod'
import { sameCart, bottleCount, type ProductId } from '../../../../shared/domain'
const input = z.object({
  name: z.string().trim().min(1).max(80), scheduleId: z.iso.date(), varietyId: z.string().max(80).nullish(),
  status: z.enum(['pending_payment', 'pending_review', 'confirmed', 'ready', 'collected', 'rejected']),
  paymentStatus: z.enum(['paid', 'unpaid']).optional(),
  remarks: orderRemarksInput.optional(),
  cart: cartInput,
}).strict()
export default defineEventHandler(async event => {
  requireAdmin(event)
  const parsed = input.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, message: 'Enter a customer, date and at least one main product.' })
  const data = parsed.data
  const initial = await findOrder(getRouterParam(event, 'token') || '')
  const order = await db().$transaction(async tx => {
    await tx.schedule.upsert({ where: { id: data.scheduleId }, update: {}, create: { id: data.scheduleId, open: false } })
    for (const id of [...new Set([initial.scheduleId, data.scheduleId])].sort()) await tx.$queryRaw`SELECT id FROM schedules WHERE id = ${id} FOR UPDATE`
    await lockVarieties(tx, [initial.varietyId, data.varietyId].filter((id): id is string => !!id))
    await tx.$queryRaw`SELECT id FROM orders WHERE id = ${initial.id}::uuid FOR UPDATE`
    const current = await tx.order.findUnique({ where: { id: initial.id }, include: { items: true } })
    if (!current || current.scheduleId !== initial.scheduleId || current.varietyId !== initial.varietyId) throw createError({ statusCode: 409, message: 'This order changed. Refresh and try again.' })
    guardOrderChange(current,data)
    if (current.refundedTotal && data.paymentStatus && data.paymentStatus !== current.manualPaymentStatus) throw createError({ statusCode: 409, message: 'Orders with refunds keep their original payment record.' })
    if (!current.manualPaymentStatus && data.paymentStatus) throw createError({ statusCode: 400, message: 'Only manual orders have a separate payment status.' })
    if (current.manualPaymentStatus && ['pending_payment', 'pending_review'].includes(data.status)) throw createError({ statusCode: 400, message: 'Manual orders use the paid or unpaid payment setting.' })
    const catalog = await orderCatalog(tx, data.cart, data.varietyId, true)
    const variety = catalog.some(p => p.varietyTracked) && data.varietyId ? await tx.caneVariety.findUniqueOrThrow({ where: { id: data.varietyId } }) : null
    const items = orderLines(catalog, data.cart).map(item => {
      const previous = current.items.find(row => row.productId === item.productId)
      return { ...item, ...(previous ? { unitPrice: previous.unitPrice, name: previous.name ?? item.name, size: previous.size ?? item.size, kind: previous.kind ?? item.kind, spaceCost: previous.kind ? previous.spaceCost : item.spaceCost } : {}) }
    })
    const mainQuantity = items.filter(item => item.kind === 'bottle').reduce((sum,item) => sum + item.quantity,0)
    if (!mainQuantity) throw createError({ statusCode: 400, message: 'Keep at least one main product on this order.' })
    const changed = current.scheduleId !== data.scheduleId || current.varietyId !== (variety?.id ?? null) || !sameCart(current.cart as Record<ProductId,number>, data.cart)
    let sequence = current.sequence
    if (current.scheduleId !== data.scheduleId) sequence = ((await tx.order.aggregate({ where: { scheduleId: data.scheduleId }, _max: { sequence: true } }))._max.sequence ?? 0) + 1
    const updated = await tx.order.update({ where: { id: current.id }, data: {
      customerName: data.name, scheduleId: data.scheduleId, sequence,
      ...(data.remarks !== undefined ? { remarks: data.remarks || null } : {}),
      varietyId: variety?.id ?? null, varietyName: variety?.name ?? null, cart: data.cart, bottles: mainQuantity, status: data.status,
      total: items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0),
      ...(current.manualPaymentStatus ? { manualPaymentStatus: data.paymentStatus ?? current.manualPaymentStatus } : {}),
      packed: ['ready', 'collected'].includes(data.status) || data.status === 'confirmed' && !changed && current.packed,
      fulfilled: current.fulfilled || data.status==='collected',
      cancellationReason: data.status==='rejected' ? current.cancellationReason || 'Cancelled by operator' : null,
      notified: ['ready', 'collected'].includes(data.status) && !changed && current.notified,
      ...(data.status === 'pending_payment' && current.status !== 'pending_payment' ? { expiresAt: new Date(Date.now() + 20 * 60_000) } : {}),
      items: { deleteMany: {}, create: items },
    } })
    await ensureDailyCapacity(tx, await tx.schedule.findUniqueOrThrow({ where: { id: data.scheduleId } }), { kecik: 0, besar: 0 })
    await ensureStockNotOversold(tx, variety ? [variety.id] : [])
    await recordAudit(tx,'order',current.id,'edited',{...current},updated)
    return updated
  })
  return { order: await toTicket(order, true) }
})
