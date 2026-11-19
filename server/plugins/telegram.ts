import { telegramAvailable, dispatchTelegramNotifications, waitForTelegramNotifications } from '../utils/telegram-notifications'
export default defineNitroPlugin(nitro => {
  if (!telegramAvailable() || !useRuntimeConfig().databaseUrl) return
  const timer = setInterval(() => { void dispatchTelegramNotifications() }, 5000)
  timer.unref()
  void dispatchTelegramNotifications()
  nitro.hooks.hook('close', async () => { clearInterval(timer); await waitForTelegramNotifications() })
})
