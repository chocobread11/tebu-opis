import { normalizePhone } from '~/shared/domain'
import { customerSessionLifetime } from '~/shared/session'
type Identity = { found: boolean; passwordRequired: boolean; token?: string; name?: string; phone?: string; protected?: boolean; expiresAt?: string }
type CheckoutIdentity = { phone: string; name: string; protected: boolean; historyUnlocked: boolean }
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
    shop.customerPhone.value = result.phone!; shop.customerName.value = result.name!; shop.customerToken.value = shop.demo ? result.token! : ''
    localStorage.setItem('customer_phone', result.phone!); localStorage.setItem('customer_name', result.name!)
    localStorage.removeItem('customer_token')
    if (shop.demo) localStorage.setItem('tebu_demo_session', JSON.stringify({ phone: result.phone, token: result.token, expiresAt: result.expiresAt }))
    protectedHistory.value = !!result.protected
    unlockedPhone.value = result.phone!
  }
  function demoSession() {
    try {
      const session = JSON.parse(localStorage.getItem('tebu_demo_session') || 'null')
      const record = session && demoCustomers()[session.phone]
      return record && session.token === record.token && new Date(session.expiresAt).getTime() > Date.now() ? session as { phone: string; token: string; expiresAt: string } : null
    } catch { return null }
  }
  async function lookup(value: string): Promise<Identity> {
    const phone = normalizePhone(value)
    if (!shop.demo) return $fetch<Identity>('/api/identity/lookup', { method: 'POST', body: { phone } })
    const record = demoCustomers()[phone]
    const previous = shop.tickets.value.find(ticket => ticket.phone === phone)
    if (!record && !previous) return { found: false, passwordRequired: false }
    if (record?.passwordHash && demoSession()?.phone !== phone) return { found: true, passwordRequired: true, protected: true }
    return { found: true, passwordRequired: false, protected: !!record?.passwordHash, name: record?.name || previous?.name, phone }
  }
  async function identify(input: { phone: string; name?: string; password?: string; protectHistory?: boolean; mode: 'history' | 'checkout' }) {
    const phone = normalizePhone(input.phone)
    if (shop.customerPhone.value !== phone) {
      if (shop.customerPhone.value) await signOut()
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
        const trusted = demoSession()?.phone === phone
        if (!input.password && !trusted) return { found: true, passwordRequired: true }
        if (input.password && await demoHash(input.password, record.salt!) !== record.passwordHash) throw new Error('Incorrect history password.')
      } else if (input.mode === 'checkout' && input.protectHistory) {
        if (!input.password || input.password.length < 8) throw new Error('Use a password with at least 8 characters.')
        record.salt = crypto.randomUUID(); record.passwordHash = await demoHash(input.password, record.salt)
      }
      records[phone] = record; localStorage.setItem('tebu_demo_customers', JSON.stringify(records))
      result = { found: true, passwordRequired: false, token: record.token, name: record.name, phone, protected: !!record.passwordHash, expiresAt: !input.password && demoSession()?.phone === phone ? demoSession()!.expiresAt : new Date(Date.now() + customerSessionLifetime).toISOString() }
    } else {
      result = await $fetch<Identity>('/api/identity', { method: 'POST', body: { ...input, phone, cookieSession: true } })
    }
    if (result.found && !result.passwordRequired && result.phone) remember(result)
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
      record.token = crypto.randomUUID()
      localStorage.setItem('tebu_demo_customers', JSON.stringify(records))
      remember({ found: true, passwordRequired: false, name: record.name, phone: shop.customerPhone.value, token: record.token, protected: password !== null, expiresAt: new Date(Date.now() + customerSessionLifetime).toISOString() })
    } else {
      await $fetch('/api/identity/password', { method: 'PUT', body: { password, currentPassword, cookieSession: true } })
      shop.customerToken.value = ''; localStorage.removeItem('customer_token')
    }
    protectedHistory.value = password !== null
  }
  async function startCheckout(input: { phone: string; name: string }) {
    const phone = normalizePhone(input.phone)
    let result: CheckoutIdentity
    if (shop.demo) {
      const records = demoCustomers()
      const record = records[phone] ||= { name: input.name, token: crypto.randomUUID() }
      localStorage.setItem('tebu_demo_customers', JSON.stringify(records))
      const session = demoSession()
      const historyUnlocked = !record.passwordHash || session?.phone === phone
      if (historyUnlocked) remember({ found: true, passwordRequired: false, name: record.name, phone, token: record.token, protected: !!record.passwordHash, expiresAt: session?.phone === phone ? session.expiresAt : new Date(Date.now() + customerSessionLifetime).toISOString() })
      else localStorage.removeItem('tebu_demo_session')
      result = { phone, name: input.name, protected: !!record.passwordHash, historyUnlocked }
    } else result = await $fetch<CheckoutIdentity>('/api/checkout', { method: 'POST', body: { ...input, phone } })
    if (!shop.demo && (shop.customerPhone.value !== phone || !result.historyUnlocked)) shop.tickets.value = []
    shop.customerPhone.value = phone; shop.customerName.value = input.name; shop.customerToken.value = ''
    localStorage.setItem('customer_phone', phone); localStorage.setItem('customer_name', input.name); localStorage.removeItem('customer_token')
    protectedHistory.value = result.protected; unlockedPhone.value = result.historyUnlocked ? phone : ''
    return result
  }
  async function signOut() {
    if (!shop.demo) await $fetch('/api/identity/logout', { method: 'POST', body: {} })
    localStorage.removeItem('tebu_demo_session'); localStorage.removeItem('customer_token'); localStorage.removeItem('customer_name')
    shop.customerToken.value = ''; shop.customerName.value = ''; shop.tickets.value = []; unlockedPhone.value = ''
  }
  return { identify, startCheckout, lookup, protectedHistory, unlockedPhone, setProtection, signOut, demoSession }
}
