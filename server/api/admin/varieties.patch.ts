import { z } from 'zod'
const input = z.object({ id: z.enum(['tebu-1', 'tebu-2']), name: z.string().trim().min(1).max(60), description: z.string().trim().max(240).default('') }).strict()
export default defineEventHandler(async event => {
  requireAdmin(event)
  const parsed = input.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, message: 'Enter a name and description for this tebu variety.' })
  const { id, ...data } = parsed.data
  return db().caneVariety.update({ where: { id }, data })
})
