export default defineEventHandler(async event => {
  requireAdmin(event)
  const kind = getRouterParam(event, 'kind')
  const body = await readBody(event)
  if (kind === 'expenses') {
    const parsed = expenseInput.safeParse(body)
    if (!parsed.success) throw createError({ statusCode: 400, message: 'Enter a valid expense date, amount and note.' })
    return db().$transaction(async tx => {
      const row = await tx.expense.create({ data: parsed.data })
      await recordAudit(tx, 'expense', row.id, 'created', undefined, row)
      return toExpense(row)
    })
  }
  if (kind === 'harvests') throw createError({ statusCode: 410, message: 'Harvest history is read-only. Restock a product from Products & inventory.' })
  throw createError({ statusCode: 404, message: 'Record type not found.' })
})
