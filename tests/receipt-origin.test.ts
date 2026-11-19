import test from 'node:test'
import assert from 'node:assert/strict'
import type { networkInterfaces } from 'node:os'
import { receiptOrigin } from '../server/utils/receipt-origin'

test('phone upload links use the public request origin or an explicit site URL', () => {
  assert.equal(receiptOrigin('https://orders.example.com:8443/path'), 'https://orders.example.com:8443')
  assert.equal(receiptOrigin('http://internal:3000', 'https://tebu.example.com/'), 'https://tebu.example.com')
  for (const configured of ['javascript:alert(1)', 'ftp://example.com', 'https://user:secret@example.com']) assert.throws(() => receiptOrigin('http://localhost:3000', configured))
})

test('local phone upload links prefer the LAN adapter and retain the dev port', () => {
  const adapter = (address: string) => ({ address, family: 'IPv4' as const, internal: false, netmask: '255.255.255.0', mac: '00:00:00:00:00:00', cidr: `${address}/24` })
  const interfaces: ReturnType<typeof networkInterfaces> = { utun0: [adapter('10.8.0.2')], en0: [adapter('192.168.1.25')] }
  assert.equal(receiptOrigin('http://localhost:3000', '', true, interfaces), 'http://192.168.1.25:3000')
  assert.equal(receiptOrigin('http://localhost:3000', '', false, interfaces), 'http://localhost:3000')
  assert.equal(receiptOrigin('http://localhost:3000', '', true, {}), 'http://localhost:3000')
  assert.equal(receiptOrigin('http://192.168.1.30:3000', '', true, interfaces), 'http://192.168.1.30:3000')
})
