import { createHash } from 'node:crypto'

type Window = { count: number; expires: number }
export class RequestLimiter {
  private windows = new Map<string, Window>()
  private lastSweep = 0
  consume(key: string, limit: number, period = 60_000, now = Date.now()) {
    if (now - this.lastSweep >= 60_000) {
      for (const [id, row] of this.windows) if (row.expires <= now) this.windows.delete(id)
      this.lastSweep = now
    }
    let row = this.windows.get(key)
    if (!row || row.expires <= now) {
      if (this.windows.size >= 50_000) return 60
      row = { count: 0, expires: now + period }; this.windows.set(key, row)
    }
    row.count++
    return row.count > limit ? Math.max(1, Math.ceil((row.expires - now) / 1000)) : 0
  }
}
export function rateLimitBucket(method: string, path: string) {
  if (method === 'GET' || method === 'HEAD') return { name: 'read', ip: 6000, session: 600 }
  if (path === '/api/admin/session' || path === '/api/identity' || path === '/api/identity/password' || path === '/api/identity/recover') return { name: 'auth', ip: 120, session: 30 }
  if (path.startsWith('/api/admin')) return { name: 'admin-write', ip: 600, session: 120 }
  if (path === '/api/checkout' || path === '/api/orders' || path === '/api/uploads' || path.startsWith('/api/orders/')) return { name: 'checkout', ip: 1200, session: 60 }
  return { name: 'write', ip: 600, session: 60 }
}
export function sessionFingerprint(value: string) {
  return createHash('sha256').update(value).digest('hex')
}
