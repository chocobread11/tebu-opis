import { z } from 'zod'
import { bottleCount, sameCart, type Cart, type ProductId } from '../../../shared/domain'
const input = z.object({ scheduleId: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), requestId: z.uuid(), varietyId: z.string().max(80).nullish(), name: z.string().trim().min(2).max(60).optional(), remarks: orderRemarksInput.optional(), cart: cartInput }).strict()
export default defineEventHandler(async event => {
  const { customer, checkoutSessionHash } = await requireCheckoutAccess(event)
  const parsed = input.safeParse(await readBody(event)); if (!parsed.success) throw createError({ statusCode: 400, message: 'Choose valid products and quantities.' })
  const data = parsed.data
  if (checkoutSessionHash && !data.name) throw createError({ statusCode: 400, message: 'Enter the name for this order.' })
  if (!useRuntimeConfig().public.duitnowQr) throw createError({ statusCode: 503, message: 'Payment QR has not been configured.' })
  const retry=await db().order.findUnique({where:{requestId:data.requestId}})
  if(retry){if(retry.customerId!==customer.id||checkoutSessionHash&&retry.checkoutSessionHash!==checkoutSessionHash||retry.scheduleId!==data.scheduleId||!sameCart(retry.cart as Cart,data.cart)||retry.customerName!==(data.name??customer.name)||retry.remarks!==(data.remarks||null))throw createError({statusCode:409,message:'This checkout changed. Start a new checkout.'});return toTicket(retry)}
  requireFutureDate(data.scheduleId)
  requireActiveWeekDate(data.scheduleId)
  const order = await db().$transaction(async tx => {
    // Serialize capacity checks and the internal ordering for each drop.
    await tx.$queryRaw`SELECT id FROM schedules WHERE id = ${data.scheduleId} FOR UPDATE`
    requireActiveWeekDate(data.scheduleId)
    const schedule = await tx.schedule.findUnique({ where: { id: data.scheduleId } })
    if (!schedule?.open || schedule.droppedAt || schedule.removedAt) throw createError({ statusCode: 409, message: 'This drop is closed.' })
    const existing = await tx.order.findUnique({ where: { requestId: data.requestId } })
    if (existing) { if (existing.customerId !== customer.id || checkoutSessionHash && existing.checkoutSessionHash !== checkoutSessionHash || existing.scheduleId !== data.scheduleId || !sameCart(existing.cart as Cart, data.cart) || existing.customerName !== (data.name ?? customer.name) || existing.remarks !== (data.remarks || null)) throw createError({ statusCode: 409, message: 'Please restart checkout.' }); return existing }
    const catalog = await orderCatalog(tx, data.cart, data.varietyId)
    const variety = catalog.some(p => p.varietyTracked) && data.varietyId ? await tx.caneVariety.findUniqueOrThrow({ where: { id: data.varietyId } }) : null
    await ensureCartStock(tx, catalog, data.cart, variety?.id)
    await ensureDailyCapacity(tx, schedule, data.cart, catalog)
    const last = await tx.order.aggregate({ where: { scheduleId: data.scheduleId }, _max: { sequence: true } })
    const sequence = (last._max.sequence ?? 0) + 1
    const items = orderLines(catalog, data.cart)
    const amount = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0)
    if (amount > 2_147_483_647) throw createError({ statusCode: 400, message: 'Order total is too large.' })
    const created=await tx.order.create({ data: { token: newToken(), requestId: data.requestId, customerId: customer.id, checkoutSessionHash, customerName: data.name ?? customer.name, remarks: data.remarks || null, varietyId: variety?.id ?? null, varietyName: variety?.name ?? null, scheduleId: data.scheduleId, sequence, cart: data.cart, bottles: bottleCount(data.cart, catalog), total: amount, expiresAt: new Date(Date.now() + 20 * 60000), items: { create: items } } })
    await recordAudit(tx,'order',created.id,'created',undefined,created,'','customer')
    return created
  })
  return toTicket(order)
})
