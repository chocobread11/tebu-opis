import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'
import { chromium } from 'playwright'

// Execute the actual compressor against real browser canvas encoders.
const constants = (await readFile('shared/media.ts', 'utf8')).replaceAll('export ', '')
const compressor = (await readFile('utils/compress.ts', 'utf8')).replace(/^import .*\n/, '').replaceAll('export ', '')
const script = ts.transpile(`${constants}\n${compressor}\nwindow.compressImage = compressImage`, { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None })
const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage()
  await page.addScriptTag({ content: script })
  const results = await page.evaluate(async () => {
    async function receipt(width, height) {
      const canvas = document.createElement('canvas')
      canvas.width = width; canvas.height = height
      const context = canvas.getContext('2d')
      context.fillStyle = 'white'; context.fillRect(0, 0, width, height)
      context.fillStyle = '#222'; context.font = '26px sans-serif'
      for (let y = 40; y < height; y += 45) context.fillText(`Payment receipt ${y}   RM 17.00   Transfer successful`, 20, y)
      return new File([await new Promise(resolve => canvas.toBlob(resolve, 'image/png'))], 'bank-receipt.png', { type: 'image/png' })
    }
    async function inspect(file) {
      const bitmap = await createImageBitmap(file)
      try { return { type: file.type, name: file.name, size: file.size, width: bitmap.width, height: bitmap.height } }
      finally { bitmap.close() }
    }
    const source = await receipt(1242, 2688)
    const webp = await inspect(await window.compressImage(source))
    const native = HTMLCanvasElement.prototype.toBlob
    try {
      HTMLCanvasElement.prototype.toBlob = function(callback, type, quality) {
        return native.call(this, callback, type === 'image/webp' ? 'image/png' : type, quality)
      }
      const jpeg = await inspect(await window.compressImage(source))
      const tall = await inspect(await window.compressImage(await receipt(400, 20000)))
      return { webp, jpeg, tall }
    } finally { HTMLCanvasElement.prototype.toBlob = native }
  })
  assert.equal(results.webp.type, 'image/webp')
  assert.equal(results.jpeg.type, 'image/jpeg')
  assert.equal(results.jpeg.name, 'receipt.jpg')
  for (const result of Object.values(results)) {
    assert.ok(result.size < 250_000)
    assert.ok(Math.max(result.width, result.height) <= 2048)
  }
  console.log('PASS: receipt compression, JPEG fallback when WebP encoding is unavailable, and tall-image bounds.')
} finally { await browser.close() }
