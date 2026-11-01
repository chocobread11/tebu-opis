import { saveHarvestRecord } from '../../../../utils/logs'
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
    const [row] = await db().expense.updateManyAndReturn({ where: { id }, data: parsed.data })
    if (!row) throw createError({ statusCode: 404, message: 'Expense not found.' })
    return toExpense(row)
  }
  if (kind === 'harvests') {
    const parsed = harvestInput.safeParse(body)
    if (!parsed.success) throw createError({ statusCode: 400, message: 'Enter a valid harvest date, tebu variety and bottle quantities.' })
    return saveHarvestRecord(parsed.data, id)
  }
  throw createError({ statusCode: 404, message: 'Record type not found.' })
})
