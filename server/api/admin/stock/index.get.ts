export default defineEventHandler(async event => {
  requireAdmin(event)
  const entries = await db().stockEntry.findMany({
    include: { product: { select: { name: true, size: true } } },
    orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
  })
  return { entries: entries.map(entry => ({ ...entry, note: entry.sourceHarvestId && entry.note.startsWith('Earlier harvest') ? 'Opening stock' : entry.note })) }
})
