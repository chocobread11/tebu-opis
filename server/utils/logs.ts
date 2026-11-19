import { z } from 'zod'
import type { Expense as DatabaseExpense, Harvest as DatabaseHarvest } from '../../generated/prisma/client'
import { malaysiaToday, type Expense, type Harvest } from '../../shared/domain'

const date = z.iso.date().transform(value => new Date(`${value}T00:00:00Z`))
export const expenseInput = z.object({ date, amount: z.number().int().min(1).max(99_999_999), note: z.string().trim().max(120).default('') }).strict()
export const harvestInput = z.object({
  date: z.iso.date().refine(value => value <= malaysiaToday(), 'Harvests cannot be in the future.').transform(value => new Date(`${value}T00:00:00Z`)),
  quantity: z.number().min(0).max(999_999).multipleOf(0.01).default(0),
  varietyId: z.enum(['tebu-1', 'tebu-2']),
  kecikQty: z.number().int().min(0).max(10000),
  besarQty: z.number().int().min(0).max(10000),
}).strict().refine(row => row.quantity > 0 || row.kecikQty + row.besarQty > 0, 'Enter harvested cane or ready bottles.')
export function toExpense(row: DatabaseExpense): Expense {
  return { id: row.id, date: row.date.toISOString().slice(0, 10), amount: row.amount, note: row.note }
}
export function toHarvest(row: DatabaseHarvest): Harvest {
  return { id: row.id, date: row.date.toISOString().slice(0, 10), quantity: Number(row.quantity), type: row.type, varietyId: row.varietyId ?? undefined, kecikQty: row.kecikQty, besarQty: row.besarQty }
}
