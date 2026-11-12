import test from 'node:test'
import assert from 'node:assert/strict'
import sharp from 'sharp'
import { prepareUploadedImage } from '../server/utils/upload-image'
import { imageMaxDimension, imageUploadLimit } from '../shared/media'

test('JPEG, PNG and WebP uploads become WebP with metadata removed', async () => {
  for (const format of ['jpeg', 'png', 'webp'] as const) {
    const input = await sharp({ create: { width: 600, height: 1200, channels: 3, background: '#eee' } })
      .withMetadata({ orientation: 6 }).toFormat(format).toBuffer()
    const output = await prepareUploadedImage(input)
    const metadata = await sharp(output).metadata()
    assert.equal(metadata.format, 'webp')
    assert.equal(metadata.orientation, undefined)
    assert.equal(metadata.exif, undefined)
    assert.equal(metadata.width, 1200)
    assert.equal(metadata.height, 600)
    assert.ok(output.length < imageUploadLimit)
  }
})

test('server recompression fits JPEGs whose WebP encoding exceeds the upload limit', async () => {
  let state = 123456789
  const pixels = Buffer.alloc(1200 * 1800 * 3)
  for (let i = 0; i < pixels.length; i++) { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; pixels[i] = state >>> 24 }
  const input = await sharp(pixels, { raw: { width: 1200, height: 1800, channels: 3 } }).jpeg({ quality: 8 }).toBuffer()
  assert.ok(input.length < imageUploadLimit)
  assert.ok((await sharp(input).webp({ quality: 85 }).toBuffer()).length > imageUploadLimit)
  const output = await prepareUploadedImage(input)
  assert.ok(output.length < imageUploadLimit)
  const metadata = await sharp(output).metadata()
  assert.equal(metadata.format, 'webp')
  assert.ok(Math.max(metadata.width!, metadata.height!) <= imageMaxDimension)
})

test('invalid images, disguised SVGs and excessive decoded dimensions are rejected', async () => {
  await assert.rejects(prepareUploadedImage(Buffer.from('not an image')))
  await assert.rejects(prepareUploadedImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>')))
  const oversized = await sharp({ create: { width: 4000, height: 4000, channels: 3, background: '#fff' } }).png().toBuffer()
  await assert.rejects(prepareUploadedImage(oversized))
})
