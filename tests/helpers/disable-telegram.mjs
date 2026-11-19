import 'dotenv/config'
// Synthetic orders must never notify the operator's real Telegram chat.
process.env.NUXT_TELEGRAM_BOT_TOKEN = ''
process.env.NUXT_TELEGRAM_CHAT_ID = ''
