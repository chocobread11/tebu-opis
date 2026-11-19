import { z } from 'zod'
import { normalizePhone } from './domain'
import { defaultWhatsAppOpening, whatsAppOpeningMaxLength } from './whatsapp'
export type PublicShopSettings = { merchantName: string; supportWhatsapp: string }
export type EditableShopSettings = PublicShopSettings & { whatsappOpening: string; siteUrl: string; telegramEnabled: boolean; telegramChatId: string }
export type ShopSettingsView = EditableShopSettings & { telegramBotConfigured: boolean }
export const defaultShopSettings: EditableShopSettings = { merchantName: 'Tebu Drop', supportWhatsapp: '', whatsappOpening: defaultWhatsAppOpening, siteUrl: '', telegramEnabled: false, telegramChatId: '' }
export function editableSettings(value: EditableShopSettings): EditableShopSettings {
  return { merchantName: value.merchantName, supportWhatsapp: value.supportWhatsapp, whatsappOpening: value.whatsappOpening, siteUrl: value.siteUrl, telegramEnabled: value.telegramEnabled, telegramChatId: value.telegramChatId }
}
export function isLocalHostname(host: string) {
  if (['localhost', '[::1]'].includes(host)) return true
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(host)) return false
  const parts = host.split('.').map(Number)
  return parts.every(part => part >= 0 && part <= 255) && (parts[0] === 127 || parts[0] === 10 || parts[0] === 192 && parts[1] === 168 || parts[0] === 172 && (parts[1] ?? -1) >= 16 && (parts[1] ?? -1) <= 31)
}
export function validSiteUrl(value: string, allowLocalHttp = false) {
  if (!value) return true
  try {
    const url = new URL(value)
    return !url.username && !url.password && !url.search && !url.hash && url.pathname === '/' && (url.protocol === 'https:' || allowLocalHttp && url.protocol === 'http:' && isLocalHostname(url.hostname))
  } catch { return false }
}
export function shopSettingsInput(allowLocalHttp = false) {
  return z.object({
    merchantName: z.string().trim().min(2, 'Enter a merchant name with at least 2 characters.').max(100),
    supportWhatsapp: z.string().trim().max(25).transform((value, ctx) => { if (!value) return ''; try { return normalizePhone(value) } catch { ctx.addIssue({ code: 'custom', message: 'Enter a valid Malaysian support mobile number.' }); return z.NEVER } }),
    whatsappOpening: z.string().trim().min(1, 'Enter a WhatsApp message opening.').max(whatsAppOpeningMaxLength),
    siteUrl: z.string().trim().max(2048).refine(value => validSiteUrl(value, allowLocalHttp), 'Enter your HTTPS website origin without a path. Local HTTP addresses work in development.').transform(value => value ? new URL(value).origin : ''),
    telegramEnabled: z.boolean(),
    telegramChatId: z.string().trim().max(20).refine(value => !value || /^-?[1-9]\d{0,18}$/.test(value), 'Enter the numeric Telegram chat ID, not a phone number.'),
  }).partial().strict().refine(value => Object.keys(value).length > 0, 'Choose a setting to update.')
}
