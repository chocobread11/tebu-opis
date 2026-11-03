import test from 'node:test'
import assert from 'node:assert/strict'
import { hashPassword, verifyPassword } from '../server/utils/password'
test('password hashes are salted and reject incorrect or malformed credentials', async () => {
  const value = 'long-enough-password-雪'
  const first = await hashPassword(value)
  const second = await hashPassword(value)
  assert.notEqual(first, second)
  assert.equal(first.includes(value), false)
  assert.equal(await verifyPassword(value, first), true)
  assert.equal(await verifyPassword('wrong-password', first), false)
  assert.equal(await verifyPassword(value, 'not-a-hash'), false)
  assert.equal(await verifyPassword(value, 'scrypt:salt:' + 'z'.repeat(128)), false)
})
