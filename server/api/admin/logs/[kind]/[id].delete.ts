import { removeHarvestRecord } from '../../../../utils/logs'
import { z } from 'zod'
export default defineEventHandler(async event => {
  requireAdmin(event)
  const kind = getRouterParam(event, 'kind')
  const id = getRouterParam(event, 'id') || ''
  if (!z.uuid().safeParse(id).success) throw createError({ statusCode: 400, message: 'Invalid record ID.' })
  if (kind !== 'expenses' && kind !== 'harvests') throw createError({ statusCode: 404, message: 'Record type not found.' })
  if (kind === 'harvests') await removeHarvestRecord(id)
  else {
    const result = await db().expense.deleteMany({ where: { id } })
    if (!result.count) throw createError({ statusCode: 404, message: 'Expense not found.' })
  }
  return { ok: true }
})
