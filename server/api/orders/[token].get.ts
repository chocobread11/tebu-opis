export default defineEventHandler(async event => toTicket(await findOrder(getRouterParam(event, 'token') || '')))
