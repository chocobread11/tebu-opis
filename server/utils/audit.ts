import type { Prisma } from '../../generated/prisma/client'
const sensitive = /password|token|hash|signature/i
function snapshot(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value, (key, item) => sensitive.test(key) ? undefined : typeof item === 'bigint' ? String(item) : item))
}
export async function recordAudit(tx: Prisma.TransactionClient, entityType: string, entityId: string, action: string, before?: unknown, after?: unknown, note = '', actor = 'admin') {
  await tx.auditEvent.create({ data: { entityType, entityId, action, actor, note, ...(before != null ? { before: snapshot(before) } : {}), ...(after != null ? { after: snapshot(after) } : {}) } })
}
