import { networkInterfaces, type NetworkInterfaceInfo } from 'node:os'

export function receiptOrigin(requestUrl: string, configuredUrl = '', development = false, interfaces: ReturnType<typeof networkInterfaces> = networkInterfaces()) {
  const url = new URL(configuredUrl.trim() || requestUrl)
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Receipt upload URL must use HTTP or HTTPS without credentials.')
  if (!configuredUrl.trim() && development && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
    // Prefer Wi-Fi/Ethernet over VPN, Docker, and virtual adapters.
    const names = Object.keys(interfaces).sort((a, b) => Number(!/^en\d+$/.test(a)) - Number(!/^en\d+$/.test(b)))
    const candidates = names.flatMap(name => interfaces[name] || []).filter((address): address is NetworkInterfaceInfo => !!address && address.family === 'IPv4' && !address.internal)
    const address = candidates.find(({ address }) => /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(address))
    if (address) url.hostname = address.address
  }
  return url.origin
}
