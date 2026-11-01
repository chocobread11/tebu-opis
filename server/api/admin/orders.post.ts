import { z } from 'zod'
import { bottleCount, normalizePhone, type ProductId } from '../../../shared/domain'
const quantity = z.number().int().min(0).max(10000)
const input = z.object({
  requestId: z.uuid(), scheduleId: z.iso.date(), name: z.string().trim().min(1).max(80),
  phone: z.string().trim().default('').transform((value, ctx) => {
    if (!value) return null
    try { return normalizePhone(value) } catch { ctx.addIssue({ code: 'custom', message: 'Enter a valid Malaysian mobile number.' }); return z.NEVER }
  }),
  varietyId: z.enum(['tebu-1', 'tebu-2']), paymentStatus: z.enum(['paid', 'unpaid']),
  cart: z.object({ flask: quantity, jug: quantity, asam: quantity, limau: quantity }).strict(),
}).strict()
export default defineEventHandler(async event => {
  requireAdmin(event)
  const parsed = input.safeParse(await readBody(event))
  if (!parsed.success || !bottleCount(parsed.data.cart)) throw createError({ statusCode: 400, message: 'Enter a customer, valid date, payment status and at least one bottle.' })
  const data = parsed.data
  const order = await db().$transaction(async tx => {
    // Admin sales can be recorded on past or closed days without opening public checkout.
    await tx.schedule.upsert({ where: { id: data.scheduleId }, update: {}, create: { id: data.scheduleId, open: false } })
    await tx.$queryRaw`SELECT id FROM schedules WHERE id = ${data.scheduleId} FOR UPDATE`
    const existing = await tx.order.findUnique({ where: { requestId: data.requestId } })
    if (existing) {
      if (!existing.manualPaymentStatus) throw createError({ statusCode: 409, message: 'Please start a new manual order.' })
      return existing
    }
    const schedule = await tx.schedule.findUniqueOrThrow({ where: { id: data.scheduleId } })
    await lockVarieties(tx, [data.varietyId])
    const variety = await tx.caneVariety.findUniqueOrThrow({ where: { id: data.varietyId } })
    const stock = await varietyStock(tx, data.varietyId)
    if (data.cart.flask > stock.flaskRemaining || data.cart.jug > stock.jugRemaining) throw createError({ statusCode: 409, message: 'Not enough bottles of this tebu variety.' })
    await ensureDailyCapacity(tx, schedule, data.cart)
    const selectedIds = (Object.keys(data.cart) as ProductId[]).filter(id => data.cart[id] > 0)
    const catalog = await tx.product.findMany({ where: { id: { in: selectedIds }, active: true } })
    if (catalog.length !== selectedIds.length) throw createError({ statusCode: 409, message: 'An item is unavailable.' })
    const items = catalog.map(product => ({ productId: product.id, quantity: data.cart[product.id as ProductId], unitPrice: product.price }))
    const customer = data.phone
      ? await tx.customer.upsert({ where: { phone: data.phone }, update: {}, create: { phone: data.phone, name: data.name, tokenHash: hashToken(newToken()) } })
      : await tx.customer.create({ data: { name: data.name, tokenHash: hashToken(newToken()) } })
    const last = await tx.order.aggregate({ where: { scheduleId: data.scheduleId }, _max: { sequence: true } })
    const sequence = (last._max.sequence ?? 0) + 1
    return tx.order.create({ data: {
      token: newToken(), requestId: data.requestId, customerId: customer.id, customerName: data.name,
      scheduleId: data.scheduleId, sequence, tag: `#A${String(sequence).padStart(2, '0')}`,
      varietyId: variety.id, varietyName: variety.name, cart: data.cart, bottles: bottleCount(data.cart),
      total: items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0),
      status: 'confirmed', manualPaymentStatus: data.paymentStatus,
      expiresAt: new Date(), items: { create: items },
    } })
  })
  return toTicket(order, true)
})
