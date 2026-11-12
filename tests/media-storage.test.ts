import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createMediaStorage, type MediaStorageConfig } from '../server/storage/media'
const config = (uploadDir: string): MediaStorageConfig => ({ uploadDir, uploadStorage: 'local', r2: { accountId: '', endpoint: '', accessKeyId: '', secretAccessKey: '', bucket: '', prefix: 'tebu/media' } })

test('local media stays readable after choosing R2 and unsafe filenames are rejected', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'tebu-media-'))
  const options = config(directory)
  const local = createMediaStorage(options)
  const remote = createMediaStorage({ ...options, uploadStorage: 'r2' })
  try {
    const bytes = Buffer.from('existing local image')
    assert.equal(await local.write('fixture.webp', bytes, 'receipt'), 'fixture.webp')
    assert.deepEqual(await remote.read('fixture.webp'), bytes)
    await assert.rejects(local.write('../escape.webp', bytes, 'receipt'), /Invalid media filename/)
    await assert.rejects(remote.write('remote.webp', bytes, 'freezer'), /Fill in the R2/)
    await remote.remove('fixture.webp')
    await assert.rejects(local.read('fixture.webp'), { code: 'ENOENT' })
  } finally { local.close(); remote.close(); await rm(directory, { recursive: true, force: true }) }
})

test('R2 uses signed S3 PUT/GET/DELETE operations and preserves object keys', async () => {
  const objects = new Map<string, Buffer>()
  const methods: string[] = []
  const server = createServer(async (request, response) => {
    const key = new URL(request.url!, 'http://localhost').pathname
    methods.push(request.method!)
    assert.ok(request.headers.authorization?.startsWith('AWS4-HMAC-SHA256 '))
    if (request.method === 'PUT') {
      assert.equal(request.headers['content-type'], 'image/webp')
      assert.equal(request.headers['cache-control'], 'private, no-store')
      const parts: Buffer[] = []; for await (const part of request) parts.push(Buffer.from(part))
      objects.set(key, Buffer.concat(parts)); response.writeHead(200, { ETag: '"fixture"' }); response.end()
    } else if (request.method === 'GET' && objects.has(key)) {
      const body = objects.get(key)!; response.writeHead(200, { 'Content-Type': 'image/webp', 'Content-Length': body.length }); response.end(body)
    } else if (request.method === 'DELETE') { objects.delete(key); response.writeHead(204); response.end() }
    else { response.writeHead(404, { 'Content-Type': 'application/xml' }); response.end('<Error><Code>NoSuchKey</Code></Error>') }
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const port = (server.address() as { port: number }).port
  const options = config(tmpdir())
  const storage = createMediaStorage({ ...options, uploadStorage: 'r2', r2: { ...options.r2, endpoint: `http://127.0.0.1:${port}`, bucket: 'test-bucket', accessKeyId: 'fixture-access', secretAccessKey: 'fixture-secret' } })
  try {
    const bytes = Buffer.from('object payload')
    const filename = await storage.write('fixture.webp', bytes, 'receipt')
    assert.equal(filename, 'r2:tebu/media/receipts/fixture.webp')
    assert.deepEqual(await storage.read(filename), bytes)
    const dropBytes = Buffer.from('separate drop image')
    const drop = await storage.write('fixture.webp', dropBytes, 'freezer')
    assert.equal(drop, 'r2:tebu/media/drops/fixture.webp')
    assert.deepEqual(await storage.read(drop), dropBytes)
    assert.deepEqual(await storage.read(filename), bytes, 'Receipt and drop keys cannot overwrite each other')
    objects.set('/test-bucket/tebu/media/legacy.webp', bytes)
    assert.deepEqual(await storage.read('r2:tebu/media/legacy.webp'), bytes, 'Existing flat keys remain readable')
    await storage.remove(filename)
    await storage.remove(drop)
    await assert.rejects(storage.read(filename), { name: 'NoSuchKey' })
    assert.deepEqual(methods, ['PUT', 'GET', 'PUT', 'GET', 'GET', 'GET', 'DELETE', 'DELETE', 'GET'])
  } finally { storage.close(); await new Promise<void>(resolve => server.close(() => resolve())) }
})
