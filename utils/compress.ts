import { imageMaxDimension, imageMimeTypes, imageUploadLimit } from '~/shared/media'

export async function compressImage(file: File, limit = imageUploadLimit): Promise<File> {
  if (!(imageMimeTypes as readonly string[]).includes(file.type)) throw new Error('Choose a JPG, PNG or WebP image.')
  if (file.size > 12_000_000) throw new Error('Choose an image smaller than 12 MB.')
  const bitmap = await createImageBitmap(file)
  try {
    if (bitmap.width * bitmap.height > 40_000_000) throw new Error('This image is too large. Use a screenshot instead.')
    const canvas = document.createElement('canvas')
    let scale = Math.min(1, imageMaxDimension / Math.max(bitmap.width, bitmap.height))
    let mime = 'image/webp'
    for (let pass = 0; pass < 8; pass++) {
      canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale))
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('Could not prepare this image. Please try another browser.')
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
      const encode = () => new Promise<Blob | null>(resolve => canvas.toBlob(resolve, mime, Math.max(.45, .88 - pass * .07)))
      let blob = await encode()
      // Browsers may silently return PNG when WebP encoding is unavailable.
      if (mime === 'image/webp' && blob?.type !== mime) { mime = 'image/jpeg'; blob = await encode() }
      if (blob && blob.type === mime && blob.size < limit) return new File([blob], `receipt.${mime === 'image/webp' ? 'webp' : 'jpg'}`, { type: mime })
      scale *= .85
    }
    throw new Error(`Could not prepare this image below ${Math.round(limit / 1000)} KB. Try a cropped screenshot.`)
  } finally { bitmap.close() }
}
