import { z } from 'zod'
import { bottleCount, normalizePhone, type ProductId } from '../../../shared/domain'
const input = z.object({
  requestId: z.uuid(), scheduleId: z.iso.date(), name: z.string().trim().min(1).max(80),
  phone: z.string().trim().default('').transform((value, ctx) => {
    if (!value) return null
    try { return normalizePhone(value) } catch { ctx.addIssue({ code: 'custom', message: 'Enter a valid Malaysian mobile number.' }); return z.NEVER }
  }),
  varietyId: z.string().max(80).nullish(), paymentStatus: z.enum(['paid', 'unpaid']),
  remarks: orderRemarksInput.optional(),
  cart: cartInput,
}).strict()
export default defineEventHandler(async event => {
  requireAdmin(event)
  const parsed = input.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, message: 'Enter a customer, valid date, payment status and at least one main product.' })
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
    const catalog = await orderCatalog(tx, data.cart, data.varietyId)
    const variety = catalog.some(p => p.varietyTracked) && data.varietyId ? await tx.caneVariety.findUniqueOrThrow({ where: { id: data.varietyId } }) : null
    await ensureCartStock(tx, catalog, data.cart, variety?.id)
    await ensureDailyCapacity(tx, schedule, data.cart, catalog)
    const items = orderLines(catalog, data.cart)
    if (items.reduce((sum,item) => sum + item.quantity * item.unitPrice,0) > 2_147_483_647) throw createError({ statusCode: 400, message: 'Order total is too large.' })
    const customer = data.phone
      ? await tx.customer.upsert({ where: { phone: data.phone }, update: {}, create: { phone: data.phone, name: data.name, tokenHash: hashToken(newToken()) } })
      : await tx.customer.create({ data: { name: data.name, tokenHash: hashToken(newToken()) } })
    const last = await tx.order.aggregate({ where: { scheduleId: data.scheduleId }, _max: { sequence: true } })
    const sequence = (last._max.sequence ?? 0) + 1
    const created=await tx.order.create({ data: {
      token: newToken(), requestId: data.requestId, customerId: customer.id, customerName: data.name,
      scheduleId: data.scheduleId, sequence,
      varietyId: variety?.id ?? null, varietyName: variety?.name ?? null, cart: data.cart, bottles: bottleCount(data.cart, catalog), remarks: data.remarks || null,
      total: items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0),
      status: 'confirmed', manualPaymentStatus: data.paymentStatus,
      expiresAt: new Date(), items: { create: items },
    } })
    await recordAudit(tx,'order',created.id,'manual_created',undefined,created)
    return created
  })
  return toTicket(order, true)
})
