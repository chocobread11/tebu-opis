const original = globalThis.fetch
const endpoint = process.env.TEBU_TELEGRAM_FIXTURE
if (!endpoint || !/^http:\/\/127\.0\.0\.1:\d+$/.test(endpoint)) throw new Error('A local Telegram fixture is required.')
globalThis.fetch = (input, options) => {
  if (typeof input === 'string' && input.startsWith('https://api.telegram.org/')) return original(endpoint + new URL(input).pathname, options)
  return original(input, options)
}
