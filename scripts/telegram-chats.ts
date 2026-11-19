import 'dotenv/config'
const token = process.env.NUXT_TELEGRAM_BOT_TOKEN?.trim()
if (!token) { console.error('Set NUXT_TELEGRAM_BOT_TOKEN in .env first.'); process.exitCode = 1 }
else {
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/getUpdates?limit=100&timeout=0`, { signal: AbortSignal.timeout(10_000) })
    const body = await response.json() as { ok?: boolean; result?: { message?: { chat?: { id: number; title?: string; first_name?: string; type: string } } }[] }
    if (!response.ok || !body.ok) throw new Error('lookup')
    const chats = new Map(body.result?.flatMap(update => update.message?.chat ? [[update.message.chat.id, update.message.chat] as const] : []))
    if (!chats.size) console.log('No chats found. Open your bot in Telegram, tap Start or send /start, then run this command again.')
    for (const chat of chats.values()) console.log(`${chat.id} — ${chat.title || chat.first_name || chat.type}`)
  } catch { console.error('Could not look up bot chats. Check the bot token and network. Use a dedicated bot without an incoming webhook.'); process.exitCode = 1 }
}
