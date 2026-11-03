import { normalizePhone } from '~/shared/domain'
type Identity = { found: boolean; passwordRequired: boolean; token?: string; name?: string; phone?: string; protected?: boolean }
type DemoCustomer = { name: string; token: string; salt?: string; passwordHash?: string }
async function demoHash(password: string, salt: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: new TextEncoder().encode(salt), iterations: 100000, hash: 'SHA-256' }, key, 256)
  return Array.from(new Uint8Array(bits), b => b.toString(16).padStart(2, '0')).join('')
}
export function useCustomerAccess() {
  const shop = useShop()
  const protectedHistory = useState('protected-history', () => false)
  const unlockedPhone = useState('unlocked-history-phone', () => '')
  function demoCustomers(): Record<string, DemoCustomer> {
    try { return JSON.parse(localStorage.getItem('tebu_demo_customers') || '{}') } catch { return {} }
  }
  function remember(result: Identity) {
    shop.customerPhone.value = result.phone!; shop.customerName.value = result.name!; shop.customerToken.value = result.token!
    localStorage.setItem('customer_phone', result.phone!); localStorage.setItem('customer_name', result.name!); localStorage.setItem('customer_token', result.token!)
    protectedHistory.value = !!result.protected
    unlockedPhone.value = result.phone!
  }
  async function identify(input: { phone: string; name?: string; password?: string; protectHistory?: boolean; mode: 'history' | 'checkout' }) {
    const phone = normalizePhone(input.phone)
    if (shop.customerPhone.value !== phone) {
      shop.customerToken.value = ''; shop.customerName.value = ''; unlockedPhone.value = ''
      localStorage.removeItem('customer_token'); localStorage.removeItem('customer_name')
      if (!shop.demo) shop.tickets.value = []
    }
    shop.customerPhone.value = phone; localStorage.setItem('customer_phone', phone)
    let result: Identity
    if (shop.demo) {
      const records = demoCustomers()
      let record = records[phone]
      if (!record) {
        const previous = shop.tickets.value.find(ticket => ticket.phone === phone)
        if (input.mode === 'history' && !previous) return { found: false, passwordRequired: false }
        record = { name: input.name || previous?.name || '', token: crypto.randomUUID() }
      }
      if (record.passwordHash) {
        if (!input.password) return { found: true, passwordRequired: true }
        if (await demoHash(input.password, record.salt!) !== record.passwordHash) throw new Error('Incorrect history password.')
      } else if (input.mode === 'checkout' && input.protectHistory) {
        if (!input.password || input.password.length < 8) throw new Error('Use a password with at least 8 characters.')
        record.salt = crypto.randomUUID(); record.passwordHash = await demoHash(input.password, record.salt)
      }
      records[phone] = record; localStorage.setItem('tebu_demo_customers', JSON.stringify(records))
      result = { found: true, passwordRequired: false, token: record.token, name: record.name, phone, protected: !!record.passwordHash }
    } else {
      result = await $fetch<Identity>('/api/identity', { method: 'POST', body: { ...input, phone }, headers: shop.customerToken.value ? { Authorization: `Bearer ${shop.customerToken.value}` } : {} })
    }
    if (result.token) remember(result)
    return result
  }
  async function setProtection(password: string | null, currentPassword?: string) {
    if (password !== null && password.length < 8) throw new Error('Use a password with at least 8 characters.')
    if (shop.demo) {
      const records = demoCustomers(); const record = records[shop.customerPhone.value]
      if (!record) throw new Error('Find your transactions first.')
      if (record.passwordHash && (!currentPassword || await demoHash(currentPassword, record.salt!) !== record.passwordHash)) throw new Error('Enter your current password to change protection.')
      record.salt = password ? crypto.randomUUID() : undefined
      record.passwordHash = password ? await demoHash(password, record.salt!) : undefined
      localStorage.setItem('tebu_demo_customers', JSON.stringify(records))
    } else {
      const result = await $fetch<{ token: string }>('/api/identity/password', { method: 'PUT', body: { password, currentPassword }, headers: { Authorization: `Bearer ${shop.customerToken.value}` } })
      shop.customerToken.value = result.token; localStorage.setItem('customer_token', result.token)
    }
    protectedHistory.value = password !== null
  }
  return { identify, protectedHistory, unlockedPhone, setProtection }
}
