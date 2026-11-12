import sharp from 'sharp'
import { imageMaxDimension, imageUploadLimit } from '../../shared/media'

/** Verify, strip metadata, and keep the stored WebP inside the upload budget. */
export async function prepareUploadedImage(input: Buffer): Promise<Buffer> {
  const image = sharp(input, { limitInputPixels: 12_000_000 })
  const metadata = await image.metadata()
  if (!['jpeg', 'png', 'webp'].includes(metadata.format || '')) throw new Error('Unsupported image format.')
  for (let pass = 0; pass < 8; pass++) {
    const edge = Math.round(imageMaxDimension * .85 ** pass)
    const output = await image.clone().rotate().resize({ width: edge, height: edge, fit: 'inside', withoutEnlargement: true })
      .flatten({ background: '#fff' }).webp({ quality: Math.max(45, 85 - pass * 7) }).toBuffer()
    if (output.length < imageUploadLimit) return output
  }
  throw new Error('Image exceeds the storage size limit.')
}
