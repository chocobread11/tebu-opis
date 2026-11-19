export default defineEventHandler(async event => { requireAdmin(event); return saveStockEntry(await readBody(event)) })
