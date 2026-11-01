import type { Expense, Harvest, LogData } from '~/shared/domain'
export type { Expense, Harvest } from '~/shared/domain'

export function useLogs() {
  const admin = useAdmin()
  const expenses = useState<Expense[]>('expenses', () => [])
  const harvests = useState<Harvest[]>('harvests', () => [])
  const revenue = useState('log-revenue', () => 0)
  const paidOrderCount = useState('log-paid-order-count', () => 0)
  const storageError = useState('log-storage-error', () => '')
  const busy = useState('log-busy', () => false)
  const browserLogsAvailable = useState('browser-logs-available', () => false)

  async function load() {
    storageError.value = ''
    try {
      if (!admin.local) {
        try {
          const saved = JSON.parse(localStorage.getItem('tebu_logs') || '{}')
          browserLogsAvailable.value = !!(saved?.expenses?.length || saved?.harvests?.length)
        } catch { browserLogsAvailable.value = false }
      }
      if (admin.local) {
        const saved = JSON.parse(localStorage.getItem('tebu_logs') || '{"expenses":[],"harvests":[]}')
        expenses.value = Array.isArray(saved.expenses) ? saved.expenses : []
        harvests.value = Array.isArray(saved.harvests) ? saved.harvests : []
      } else {
        const data = await $fetch<LogData>('/api/admin/logs', { headers: admin.headers.value })
        expenses.value = data.expenses; harvests.value = data.harvests
        revenue.value = data.revenue; paidOrderCount.value = data.paidOrderCount; admin.varieties.value = data.varieties
      }
    } catch (error: any) {
      storageError.value = error.data?.message || 'Could not load your records. Please try again.'
      throw error
    }
  }

  async function mutate(operation: () => Promise<void>) {
    if (busy.value) return false
    busy.value = true; storageError.value = ''
    try { await operation(); return true }
    catch (error: any) { storageError.value = error.data?.message || error.message || 'Could not save your records. Please try again.'; return false }
    finally { busy.value = false }
  }

  async function saveRecord(kind: 'expenses' | 'harvests', record: Expense | Harvest, editing: boolean) {
    return mutate(async () => {
      if (admin.local) {
        const nextExpenses = kind === 'expenses' ? editing ? expenses.value.map(row => row.id === record.id ? record as Expense : row) : [...expenses.value, record as Expense] : expenses.value
        const nextHarvests = kind === 'harvests' ? editing ? harvests.value.map(row => row.id === record.id ? record as Harvest : row) : [...harvests.value, record as Harvest] : harvests.value
        localStorage.setItem('tebu_logs', JSON.stringify({ expenses: nextExpenses, harvests: nextHarvests }))
        expenses.value = nextExpenses; harvests.value = nextHarvests
      } else {
        const { id, ...recordBody } = record
        const body = kind === 'harvests' ? { date: (record as Harvest).date, quantity: (record as Harvest).quantity, varietyId: (record as Harvest).varietyId, flaskQty: (record as Harvest).flaskQty, jugQty: (record as Harvest).jugQty } : recordBody
        const path = `/api/admin/logs/${kind}${editing ? `/${id}` : ''}`
        const saved = await $fetch<Expense | Harvest>(path, { method: editing ? 'PATCH' : 'POST', body, headers: admin.headers.value })
        if (kind === 'expenses') expenses.value = editing ? expenses.value.map(row => row.id === saved.id ? saved as Expense : row) : [...expenses.value, saved as Expense]
        else harvests.value = editing ? harvests.value.map(row => row.id === saved.id ? saved as Harvest : row) : [...harvests.value, saved as Harvest]
        if (kind === 'harvests') await load().catch(() => {})
      }
    })
  }

  async function remove(kind: 'expenses' | 'harvests', id: string) {
    return mutate(async () => {
      const nextExpenses = kind === 'expenses' ? expenses.value.filter(row => row.id !== id) : expenses.value
      const nextHarvests = kind === 'harvests' ? harvests.value.filter(row => row.id !== id) : harvests.value
      if (admin.local) localStorage.setItem('tebu_logs', JSON.stringify({ expenses: nextExpenses, harvests: nextHarvests }))
      else await $fetch(`/api/admin/logs/${kind}/${id}`, { method: 'DELETE', headers: admin.headers.value })
      expenses.value = nextExpenses; harvests.value = nextHarvests
      if (!admin.local && kind === 'harvests') await load().catch(() => {})
    })
  }

  async function importBrowserLogs() {
    return mutate(async () => {
      const saved = JSON.parse(localStorage.getItem('tebu_logs') || '{"expenses":[],"harvests":[]}')
      await $fetch('/api/admin/logs/import', { method: 'POST', body: saved, headers: admin.headers.value })
      localStorage.setItem('tebu_logs_imported_backup', JSON.stringify(saved))
      localStorage.removeItem('tebu_logs')
      browserLogsAvailable.value = false
      await load()
    })
  }

  const totalExpenses = computed(() => expenses.value.reduce((sum, expense) => sum + expense.amount, 0))
  return { expenses, harvests, revenue, paidOrderCount, busy, browserLogsAvailable, storageError, totalExpenses, load, saveRecord, remove, importBrowserLogs }
}
