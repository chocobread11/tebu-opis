export default defineEventHandler(async event => {
  requireAdmin(event)
  const [expenses, harvests, paid] = await db().$transaction([
    db().expense.findMany({ orderBy: [{ date: 'desc' }, { createdAt: 'desc' }] }),
    db().harvest.findMany({ orderBy: [{ date: 'desc' }, { createdAt: 'desc' }] }),
    db().order.aggregate({ where: { OR:[{refundedTotal:{gt:0}},{status:{in:['confirmed','ready','collected']},OR:[{manualPaymentStatus:null},{manualPaymentStatus:'paid'}]}] }, _sum: { total: true, refundedTotal:true }, _count: true }),
  ])
  return { expenses: expenses.map(toExpense), harvests: harvests.map(toHarvest), revenue: (paid._sum.total ?? 0)-(paid._sum.refundedTotal ?? 0), paidOrderCount: paid._count, varieties: await catalogStock(db()) }
})
