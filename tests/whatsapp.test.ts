import test from 'node:test'
import assert from 'node:assert/strict'
import { ticketWhatsAppUrl } from '../shared/domain'
import { defaultWhatsAppOpening, renderWhatsAppOpening } from '../shared/whatsapp'

test('editing the WhatsApp opening preserves the customer ticket URL and recipient', () => {
  const ticket = { name: 'Aina & Co', tag: '#A09', phone: '60123456789', token: 'same-private-token' }
  const original = new URL(ticketWhatsAppUrl(ticket, 'https://tebu.example'))
  const updated = new URL(ticketWhatsAppUrl(ticket, 'https://tebu.example', 'Salam {name}! Order {tag} is ready.'))
  assert.equal(updated.pathname, original.pathname)
  const link = 'https://tebu.example/drop?t=same-private-token'
  assert.equal(original.searchParams.get('text')?.split('\n').at(-1), link)
  assert.equal(updated.searchParams.get('text'), `Salam Aina & Co! Order #A09 is ready.\n${link}`)
  assert.equal(renderWhatsAppOpening(defaultWhatsAppOpening, ticket).includes('#A09'), true)
})

test('template values are literal and never interpreted as replacement instructions', () => {
  assert.equal(renderWhatsAppOpening('{name} {tag} {name}', { name: '$&', tag: '{name}' }), '$& {name} $&')
})
