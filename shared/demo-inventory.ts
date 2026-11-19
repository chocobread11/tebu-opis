import { products as defaults, demoVarieties, malaysiaToday, type Product, type Ticket } from './domain'

export type DemoStockEntry = { id: string; productId: string; kind?: 'restock'|'adjustment'; varietyId?: string | null; date: string; quantity: number; note: string; sourceHarvestId?: string | null }
const splitId = (id: string, varietyId?: string | null) => varietyId && varietyId !== 'tebu-1' ? `${varietyId}-${id}` : id

/** Upgrade the browser catalog once, retaining custom products, images and restocks. */
export function demoInventory(saved: Product[] | null, records: DemoStockEntry[], tickets: Ticket[]) {
  const entries = records.map(row => row.varietyId ? { ...row, productId: splitId(row.productId, row.varietyId), varietyId: null } : row)
  const catalog = (saved || defaults).flatMap(p => p.varietyTracked ? demoVarieties.map(v => ({
    ...p, id: splitId(p.id, v.id), name: `${v.name} · ${p.name}`, varietyTracked: false,
    stocks: undefined,
  })) : [{ ...p }])
  for (const p of catalog) {
    if (!saved || saved.some(row => row.varietyTracked)) {
      const match = /^(?:tebu-2-)?(kecik|besar)$/.exec(p.id)
      const varietyId = p.id.startsWith('tebu-2-') ? 'tebu-2' : 'tebu-1'
      const variety = demoVarieties.find(v => v.id === varietyId)
      const oldProduct = saved?.find(row => row.varietyTracked && (row.id === p.id || `${varietyId}-${row.id}` === p.id))
      const priorStock = oldProduct?.stocks?.find(row => row.varietyId === varietyId)
      const restocked = entries.filter(e => e.productId === p.id).reduce((n, e) => n + e.quantity, 0)
      const initial = priorStock ? priorStock.stocked - restocked : match ? variety?.[match[1] === 'kecik' ? 'kecikQty' : 'besarQty'] || 0 : 0
      if (initial > 0) entries.push({ id: `opening-${p.id}`, productId: p.id, date: malaysiaToday(), quantity: initial, note: 'Opening stock from earlier inventory' })
    }
    const stocked = entries.filter(e => e.productId === p.id && e.date.slice(0, 10) <= malaysiaToday()).reduce((n, e) => n + e.quantity, 0)
    const reserved = tickets.filter(t => t.status !== 'rejected' && (t.status !== 'pending_payment' || !!t.expiresAt && new Date(t.expiresAt).getTime() > Date.now())).reduce((n, t) => n + (t.cart[p.id] || 0), 0)
    p.stocks = [{ stocked, reserved, remaining: stocked - reserved }]
  }
  return { products: catalog, entries }
}
