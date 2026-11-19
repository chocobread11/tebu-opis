import { shopSettingsInput } from '../../../shared/settings'
import { defaultWhatsAppOpening } from '../../../shared/whatsapp'
import { publicHttpsOrigin } from '../../deployment/config'
export default defineEventHandler(async event => {
  requireAdmin(event)
  const parsed = shopSettingsInput(import.meta.dev).safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, message: parsed.error.issues[0]?.message || 'Enter valid settings.', data: { fields: parsed.error.issues.map(issue => String(issue.path[0] || 'form')) } })
  if (useRuntimeConfig().deploymentMode === 'production' && parsed.data.siteUrl !== undefined && !publicHttpsOrigin(parsed.data.siteUrl)) throw createError({ statusCode: 400, message: 'Production links require your public HTTPS website origin.', data: { fields: ['siteUrl'] } })
  return db().$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM shop_settings WHERE id='main' FOR UPDATE`
    const before = await tx.shopSettings.findUnique({ where: { id: 'main' } })
    const current = await shopSettings(tx), next = { ...current, ...parsed.data }
    if (next.telegramEnabled && (!next.telegramChatId || !next.telegramBotConfigured)) throw createError({ statusCode: 400, message: 'Configure the server bot token and a chat ID before enabling Telegram alerts.', data: { fields: ['telegramEnabled', 'telegramChatId'] } })
    const saved = await tx.shopSettings.upsert({ where: { id: 'main' }, create: { id: 'main', whatsappOpening: defaultWhatsAppOpening, ...parsed.data }, update: parsed.data })
    await recordAudit(tx, 'settings', 'main', 'edited', before, saved)
    return shopSettings(tx)
  })
})
