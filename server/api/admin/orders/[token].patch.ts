import { z } from 'zod'
import { bottleCount, type ProductId } from '../../../../shared/domain'
const qty = z.number().int().min(0).max(10000)
const input = z.object({
  name: z.string().trim().min(1).max(80), scheduleId: z.iso.date(), varietyId: z.enum(['tebu-1', 'tebu-2']),
  status: z.enum(['pending_payment', 'pending_review', 'confirmed', 'ready', 'collected', 'rejected']),
  paymentStatus: z.enum(['paid', 'unpaid']).optional(),
  remarks: orderRemarksInput.optional(),
  cart: z.object({ kecik: qty, besar: qty, asam: qty, limau: qty }).strict(),
}).strict()
export default defineEventHandler(async event => {
  requireAdmin(event)
  const parsed = input.safeParse(await readBody(event))
  if (!parsed.success || !bottleCount(parsed.data.cart)) throw createError({ statusCode: 400, message: 'Enter a customer, date, variety and at least one bottle.' })
  const data = parsed.data
  const initial = await findOrder(getRouterParam(event, 'token') || '')
  const order = await db().$transaction(async tx => {
    await tx.schedule.upsert({ where: { id: data.scheduleId }, update: {}, create: { id: data.scheduleId, open: false } })
    for (const id of [...new Set([initial.scheduleId, data.scheduleId])].sort()) await tx.$queryRaw`SELECT id FROM schedules WHERE id = ${id} FOR UPDATE`
    await lockVarieties(tx, [initial.varietyId, data.varietyId].filter((id): id is string => !!id))
    await tx.$queryRaw`SELECT id FROM orders WHERE id = ${initial.id}::uuid FOR UPDATE`
    const current = await tx.order.findUnique({ where: { id: initial.id }, include: { items: true } })
    if (!current || current.scheduleId !== initial.scheduleId || current.varietyId !== initial.varietyId) throw createError({ statusCode: 409, message: 'This order changed. Refresh and try again.' })
    if (!current.manualPaymentStatus && data.paymentStatus) throw createError({ statusCode: 400, message: 'Only manual orders have a separate payment status.' })
    if (current.manualPaymentStatus && ['pending_payment', 'pending_review'].includes(data.status)) throw createError({ statusCode: 400, message: 'Manual orders use the paid or unpaid payment setting.' })
    const variety = await tx.caneVariety.findUniqueOrThrow({ where: { id: data.varietyId } })
    const ids = (Object.keys(data.cart) as ProductId[]).filter(id => data.cart[id] > 0)
    const catalog = await tx.product.findMany({ where: { id: { in: ids } } })
    if (catalog.length !== ids.length) throw createError({ statusCode: 400, message: 'An item no longer exists.' })
    const items = catalog.map(product => ({ productId: product.id, quantity: data.cart[product.id as ProductId], unitPrice: current.items.find(item => item.productId === product.id)?.unitPrice ?? product.price }))
    const changed = current.scheduleId !== data.scheduleId || current.varietyId !== data.varietyId || (Object.keys(data.cart) as ProductId[]).some(id => (current.cart as Record<ProductId, number>)[id] !== data.cart[id])
    let sequence = current.sequence
    if (current.scheduleId !== data.scheduleId) sequence = ((await tx.order.aggregate({ where: { scheduleId: data.scheduleId }, _max: { sequence: true } }))._max.sequence ?? 0) + 1
    const updated = await tx.order.update({ where: { id: current.id }, data: {
      customerName: data.name, scheduleId: data.scheduleId, sequence, tag: `#A${String(sequence).padStart(2, '0')}`,
      ...(data.remarks !== undefined ? { remarks: data.remarks || null } : {}),
      varietyId: variety.id, varietyName: variety.name, cart: data.cart, bottles: bottleCount(data.cart), status: data.status,
      total: items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0),
      ...(current.manualPaymentStatus ? { manualPaymentStatus: data.paymentStatus ?? current.manualPaymentStatus } : {}),
      packed: ['ready', 'collected'].includes(data.status) || data.status === 'confirmed' && !changed && current.packed,
      notified: ['ready', 'collected'].includes(data.status) && !changed && current.notified,
      ...(data.status === 'pending_payment' && current.status !== 'pending_payment' ? { expiresAt: new Date(Date.now() + 20 * 60_000) } : {}),
      items: { deleteMany: {}, create: items },
    } })
    await ensureDailyCapacity(tx, await tx.schedule.findUniqueOrThrow({ where: { id: data.scheduleId } }), { kecik: 0, besar: 0 })
    await ensureStockNotOversold(tx, [variety.id])
    return updated
  })
  return { order: await toTicket(order, true) }
})
