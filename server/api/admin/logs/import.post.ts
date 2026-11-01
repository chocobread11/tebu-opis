import { z } from 'zod'
export default defineEventHandler(async event => {
  requireAdmin(event)
  // Old log fields are read only for import; they never create ready stock implicitly.
  const input = z.object({
    expenses: z.array(z.object({ id: z.uuid(), date: z.iso.date(), amount: z.number().int().min(1).max(99_999_999), note: z.string().trim().max(120).default('') })).max(1000),
    harvests: z.array(z.object({ id: z.uuid(), date: z.iso.date(), quantity: z.number().min(0).max(999_999), type: z.string().trim().min(1).max(60) })).max(1000),
  }).strict()
  const parsed = input.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, message: 'Saved browser logs contain invalid records.' })
  await db().$transaction([
    db().expense.createMany({ data: parsed.data.expenses.map(row => ({ ...row, date: new Date(`${row.date}T00:00:00Z`) })), skipDuplicates: true }),
    db().harvest.createMany({ data: parsed.data.harvests.map(row => ({ ...row, date: new Date(`${row.date}T00:00:00Z`), flaskQty: 0, jugQty: 0 })), skipDuplicates: true }),
  ])
  return { ok: true }
})
