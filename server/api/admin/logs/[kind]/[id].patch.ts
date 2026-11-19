import { z } from 'zod'
export default defineEventHandler(async event => {
  requireAdmin(event)
  const kind = getRouterParam(event, 'kind')
  const id = getRouterParam(event, 'id') || ''
  if (!z.uuid().safeParse(id).success) throw createError({ statusCode: 400, message: 'Invalid record ID.' })
  const body = await readBody(event)
  if (kind === 'expenses') {
    const parsed = expenseInput.safeParse(body)
    if (!parsed.success) throw createError({ statusCode: 400, message: 'Enter a valid expense date, amount and note.' })
    return db().$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM expenses WHERE id=${id}::uuid FOR UPDATE`
      const before = await tx.expense.findUnique({ where: { id } })
      if (!before) throw createError({ statusCode: 404, message: 'Expense not found.' })
      const row = await tx.expense.update({ where: { id }, data: parsed.data })
      await recordAudit(tx, 'expense', id, 'edited', before, row)
      return toExpense(row)
    })
  }
  if (kind === 'harvests') throw createError({ statusCode: 410, message: 'Harvest history is read-only. Restock a product from Products & inventory.' })
  throw createError({ statusCode: 404, message: 'Record type not found.' })
})
