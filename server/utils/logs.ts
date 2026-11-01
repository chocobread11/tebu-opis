import { z } from 'zod'
import type { Expense as DatabaseExpense, Harvest as DatabaseHarvest } from '../../generated/prisma/client'
import { malaysiaToday, type Expense, type Harvest } from '../../shared/domain'

const date = z.iso.date().transform(value => new Date(`${value}T00:00:00Z`))
export const expenseInput = z.object({ date, amount: z.number().int().min(1).max(99_999_999), note: z.string().trim().max(120).default('') }).strict()
export const harvestInput = z.object({
  date: z.iso.date().refine(value => value <= malaysiaToday(), 'Harvests cannot be in the future.').transform(value => new Date(`${value}T00:00:00Z`)),
  quantity: z.number().min(0).max(999_999).multipleOf(0.01).default(0),
  varietyId: z.enum(['tebu-1', 'tebu-2']),
  flaskQty: z.number().int().min(0).max(10000),
  jugQty: z.number().int().min(0).max(10000),
}).strict().refine(row => row.quantity > 0 || row.flaskQty + row.jugQty > 0, 'Enter harvested cane or ready bottles.')
export function toExpense(row: DatabaseExpense): Expense {
  return { id: row.id, date: row.date.toISOString().slice(0, 10), amount: row.amount, note: row.note }
}
export function toHarvest(row: DatabaseHarvest): Harvest {
  return { id: row.id, date: row.date.toISOString().slice(0, 10), quantity: Number(row.quantity), type: row.type, varietyId: row.varietyId ?? undefined, flaskQty: row.flaskQty, jugQty: row.jugQty }
}
export async function saveHarvestRecord(data: z.infer<typeof harvestInput>, id?: string) {
  return db().$transaction(async tx => {
    if (id) await tx.$queryRaw`SELECT id FROM harvests WHERE id = ${id}::uuid FOR UPDATE`
    const existing = id ? await tx.harvest.findUnique({ where: { id } }) : null
    if (id && !existing) throw createError({ statusCode: 404, message: 'Harvest not found.' })
    const ids = [data.varietyId, ...(existing?.varietyId ? [existing.varietyId] : [])]
    await lockVarieties(tx, ids)
    const variety = await tx.caneVariety.findUniqueOrThrow({ where: { id: data.varietyId } })
    const values = { ...data, type: variety.name }
    const row = id ? await tx.harvest.update({ where: { id }, data: values }) : await tx.harvest.create({ data: values })
    await ensureStockNotOversold(tx, ids)
    return toHarvest(row)
  })
}
export async function removeHarvestRecord(id: string) {
  return db().$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM harvests WHERE id = ${id}::uuid FOR UPDATE`
    const row = await tx.harvest.findUnique({ where: { id } })
    if (!row) throw createError({ statusCode: 404, message: 'Harvest not found.' })
    if (row.varietyId) await lockVarieties(tx, [row.varietyId])
    await tx.harvest.delete({ where: { id } })
    if (row.varietyId) await ensureStockNotOversold(tx, [row.varietyId])
  })
}
