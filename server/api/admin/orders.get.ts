import { z } from 'zod'
import type { Prisma } from '../../../generated/prisma/client'
import { paymentStatuses } from '../../../shared/payment'
const input = z.object({
  search: z.string().trim().max(100).default(''),
  date: z.iso.date().optional(),
  paymentStatus: z.enum(paymentStatuses).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().pipe(z.union([z.literal(10), z.literal(25), z.literal(50), z.literal(100)])).default(10),
})
export default defineEventHandler(async event => {
  requireAdmin(event)
  const parsed = input.safeParse(getQuery(event))
  if (!parsed.success) throw createError({ statusCode: 400, message: 'Choose a valid date, page and number of rows.' })
  const { search, date, pageSize, paymentStatus } = parsed.data
  const where: Prisma.OrderWhereInput = {
    ...(date ? { scheduleId: date } : {}),
    ...(paymentStatus ? { AND: [paymentFilter(paymentStatus)] } : {}),
    ...(search ? { OR: [
      { customerName: { contains: search, mode: 'insensitive' } },
      { customer: { name: { contains: search, mode: 'insensitive' } } },
      { customer: { phone: { contains: search } } },
      { tag: { contains: search, mode: 'insensitive' } },
      { remarks: { contains: search, mode: 'insensitive' } },
      { scheduleId: { contains: search } },
      { varietyName: { contains: search, mode: 'insensitive' } },
      { status: { contains: search.replaceAll(' ', '_'), mode: 'insensitive' } },
    ] } : {}),
  }
  return db().$transaction(async tx => {
    const total = await tx.order.count({ where })
    const page = Math.min(parsed.data.page, Math.max(1, Math.ceil(total / pageSize)))
    const rows = await tx.order.findMany({ where, orderBy: [{ scheduleId: 'desc' }, { sequence: 'desc' }], skip: (page - 1) * pageSize, take: pageSize })
    return { orders: await Promise.all(rows.map(order => toTicket(order, true, tx))), total, page, pageSize }
  })
})
