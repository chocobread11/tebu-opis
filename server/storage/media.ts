import { mkdir, writeFile, readFile, unlink } from 'node:fs/promises'
import { resolve, join, basename } from 'node:path'
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'

export type MediaStorageConfig = {
  uploadDir: string
  uploadStorage: string
  r2: { accountId: string; endpoint: string; accessKeyId: string; secretAccessKey: string; bucket: string; prefix: string }
}
export class MediaStorageConfigurationError extends Error {}

export function createMediaStorage(config: MediaStorageConfig) {
  let client: S3Client | undefined
  function remote() {
    const r2 = config.r2
    if ((!r2.accountId && !r2.endpoint) || !r2.accessKeyId || !r2.secretAccessKey || !r2.bucket) throw new MediaStorageConfigurationError('Fill in the R2 endpoint/account ID, bucket and access keys before enabling R2 storage.')
    client ??= new S3Client({
      region: 'auto', endpoint: r2.endpoint || `https://${r2.accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: r2.accessKeyId, secretAccessKey: r2.secretAccessKey },
      forcePathStyle: true, maxAttempts: 2,
      requestChecksumCalculation: 'WHEN_REQUIRED', responseChecksumValidation: 'WHEN_REQUIRED',
    })
    return client
  }
  function localPath(filename: string) {
    if (basename(filename) !== filename || !/^[\w-]+\.webp$/.test(filename)) throw new Error('Invalid media filename.')
    return join(resolve(config.uploadDir), filename)
  }
  return {
    async write(filename: string, bytes: Buffer) {
      localPath(filename)
      if (config.uploadStorage === 'r2') {
        const prefix = config.r2.prefix.replace(/^\/+|\/+$/g, '')
        const key = prefix ? `${prefix}/${filename}` : filename
        await remote().send(new PutObjectCommand({ Bucket: config.r2.bucket, Key: key, Body: bytes, ContentType: 'image/webp', CacheControl: 'private, no-store' }))
        return `r2:${key}`
      }
      if (config.uploadStorage !== 'local') throw new MediaStorageConfigurationError('Set NUXT_UPLOAD_STORAGE to local or r2.')
      await mkdir(resolve(config.uploadDir), { recursive: true, mode: 0o700 })
      await writeFile(localPath(filename), bytes, { mode: 0o600, flag: 'wx' })
      return filename
    },
    async read(filename: string) {
      if (!filename.startsWith('r2:')) return readFile(localPath(filename))
      const object = await remote().send(new GetObjectCommand({ Bucket: config.r2.bucket, Key: filename.slice(3) }))
      if (!object.Body) throw new Error('Empty storage response.')
      return Buffer.from(await object.Body.transformToByteArray())
    },
    async remove(filename: string) {
      if (!filename.startsWith('r2:')) return unlink(localPath(filename))
      await remote().send(new DeleteObjectCommand({ Bucket: config.r2.bucket, Key: filename.slice(3) }))
    },
    close() { client?.destroy() },
  }
}
