export async function compressImage(file: File, limit = 80_000): Promise<File> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Choose a JPG, PNG or WebP image.')
  if (file.size > 12_000_000) throw new Error('Choose an image smaller than 12 MB.')
  const bitmap = await createImageBitmap(file)
  try {
    if (bitmap.width * bitmap.height > 40_000_000) throw new Error('This image is too large. Use a screenshot instead.')
    const canvas = document.createElement('canvas')
    let width = Math.min(bitmap.width, 1400)
    for (let pass = 0; pass < 8; pass++) {
      canvas.width = Math.round(width); canvas.height = Math.round(bitmap.height * width / bitmap.width)
      const ctx = canvas.getContext('2d')!; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/webp', Math.max(.45, .88 - pass * .07)))
      if (blob && blob.type === 'image/webp' && blob.size < limit) return new File([blob], 'receipt.webp', { type: 'image/webp' })
      width *= .82
    }
    throw new Error('Could not compress this image below 80 KB. Try a cropped screenshot.')
  } finally { bitmap.close() }
}
