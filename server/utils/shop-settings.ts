import type { Prisma } from '../../generated/prisma/client'
import type { PublicShopSettings, ShopSettingsView } from '../../shared/settings'
import { defaultWhatsAppOpening } from '../../shared/whatsapp'
export async function shopSettings(client: Pick<Prisma.TransactionClient, 'shopSettings'> = db()): Promise<ShopSettingsView> {
  const config = useRuntimeConfig(), row = await client.shopSettings.findUnique({ where: { id: 'main' } })
  const botConfigured = !!String(config.telegram.botToken || '').trim(), chatId = String(config.telegram.chatId || '').trim()
  return {
    whatsappOpening: row?.whatsappOpening ?? defaultWhatsAppOpening,
    merchantName: row?.merchantName ?? String(config.public.merchantName || ''),
    supportWhatsapp: row?.supportWhatsapp ?? String(config.public.supportWhatsapp || ''),
    siteUrl: row?.siteUrl ?? String(config.siteUrl || ''),
    telegramEnabled: row?.telegramEnabled ?? (botConfigured && !!chatId),
    telegramChatId: row?.telegramChatId ?? chatId,
    telegramBotConfigured: botConfigured,
  }
}
export function publicShopSettings(settings: PublicShopSettings): PublicShopSettings {
  return { merchantName: settings.merchantName, supportWhatsapp: settings.supportWhatsapp }
}
