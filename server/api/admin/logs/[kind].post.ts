import { saveHarvestRecord } from '../../../utils/logs'
export default defineEventHandler(async event => {
  requireAdmin(event)
  const kind = getRouterParam(event, 'kind')
  const body = await readBody(event)
  if (kind === 'expenses') {
    const parsed = expenseInput.safeParse(body)
    if (!parsed.success) throw createError({ statusCode: 400, message: 'Enter a valid expense date, amount and note.' })
    return toExpense(await db().expense.create({ data: parsed.data }))
  }
  if (kind === 'harvests') {
    const parsed = harvestInput.safeParse(body)
    if (!parsed.success) throw createError({ statusCode: 400, message: 'Enter a valid harvest date, tebu variety and bottle quantities.' })
    return saveHarvestRecord(parsed.data)
  }
  throw createError({ statusCode: 404, message: 'Record type not found.' })
})
