import { z } from 'zod'
export default defineEventHandler(async event => {
  requireAdmin(event)
  const kind = getRouterParam(event, 'kind')
  const id = getRouterParam(event, 'id') || ''
  if (!z.uuid().safeParse(id).success) throw createError({ statusCode: 400, message: 'Invalid record ID.' })
  if (kind !== 'expenses' && kind !== 'harvests') throw createError({ statusCode: 404, message: 'Record type not found.' })
  if (kind === 'harvests') throw createError({ statusCode: 410, message: 'Harvest history is read-only.' })
  else {
    await db().$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM expenses WHERE id=${id}::uuid FOR UPDATE`
      const before = await tx.expense.findUnique({ where: { id } })
      if (!before) throw createError({ statusCode: 404, message: 'Expense not found.' })
      await tx.expense.delete({ where: { id } })
      await recordAudit(tx, 'expense', id, 'deleted', before)
    })
  }
  return { ok: true }
})
