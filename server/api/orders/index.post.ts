import { z } from 'zod'
import { bottleCount, type ProductId } from '../../../shared/domain'
const qty = z.number().int().min(0).max(10)
const input = z.object({ scheduleId: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), requestId: z.uuid(), varietyId: z.enum(['tebu-1', 'tebu-2']), cart: z.object({ flask: qty, jug: qty, asam: qty, limau: qty }).strict() }).strict()
export default defineEventHandler(async event => {
  const customer = await requireCustomer(event)
  const parsed = input.safeParse(await readBody(event)); if (!parsed.success || !bottleCount(parsed.data.cart)) throw createError({ statusCode: 400, message: 'Add at least one bottle. Maximum 10 of each item.' })
  const data = parsed.data
  if (!useRuntimeConfig().public.duitnowQr) throw createError({ statusCode: 503, message: 'Payment QR has not been configured.' })
  requireFutureDate(data.scheduleId)
  requireActiveWeekDate(data.scheduleId)
  const order = await db().$transaction(async tx => {
    // Serialize capacity checks and tag allocation for each drop.
    await tx.$queryRaw`SELECT id FROM schedules WHERE id = ${data.scheduleId} FOR UPDATE`
    requireActiveWeekDate(data.scheduleId)
    const schedule = await tx.schedule.findUnique({ where: { id: data.scheduleId } })
    if (!schedule?.open || schedule.droppedAt || schedule.removedAt) throw createError({ statusCode: 409, message: 'This drop is closed.' })
    const existing = await tx.order.findUnique({ where: { requestId: data.requestId } })
    if (existing) { if (existing.customerId !== customer.id) throw createError({ statusCode: 409, message: 'Please restart checkout.' }); return existing }
    await lockVarieties(tx, [data.varietyId])
    const variety = await tx.caneVariety.findUniqueOrThrow({ where: { id: data.varietyId } })
    const stock = await varietyStock(tx, data.varietyId)
    if (data.cart.flask > stock.flaskRemaining || data.cart.jug > stock.jugRemaining) throw createError({ statusCode: 409, message: 'Not enough bottles of this tebu variety. Refresh the menu and choose the available quantity.' })
    await ensureDailyCapacity(tx, schedule, data.cart)
    const usage = await tx.order.aggregate({ where: { scheduleId: data.scheduleId, status: { not: 'rejected' }, OR: [{ status: { not: 'pending_payment' } }, { expiresAt: { gt: new Date() } }] }, _sum: { bottles: true } })
    if ((usage._sum.bottles ?? 0) + bottleCount(data.cart) > schedule.capacity) throw createError({ statusCode: 409, message: 'This drop has filled up. Choose another day or fewer bottles.' })
    const last = await tx.order.aggregate({ where: { scheduleId: data.scheduleId }, _max: { sequence: true } })
    const sequence = (last._max.sequence ?? 0) + 1
    const selectedIds = (Object.keys(data.cart) as ProductId[]).filter(id => data.cart[id] > 0)
    const catalog = await tx.product.findMany({ where: { id: { in: selectedIds }, active: true } })
    if (catalog.length !== selectedIds.length) throw createError({ statusCode: 409, message: 'An item is unavailable. Refresh the menu and try again.' })
    const items = catalog.map(product => ({ productId: product.id, quantity: data.cart[product.id as ProductId], unitPrice: product.price }))
    const amount = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0)
    return tx.order.create({ data: { token: newToken(), requestId: data.requestId, customerId: customer.id, varietyId: variety.id, varietyName: variety.name, scheduleId: data.scheduleId, sequence, tag: `#A${String(sequence).padStart(2, '0')}`, cart: data.cart, bottles: bottleCount(data.cart), total: amount, expiresAt: new Date(Date.now() + 20 * 60000), items: { create: items } } })
  })
  return toTicket(order)
})
