import 'dotenv/config'
import { spawn } from 'node:child_process'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { S3Client } from '@aws-sdk/client-s3'
import { createMediaStorage, r2ApiEndpoint } from '../../server/storage/media'

export const value = (name: string) => process.env[name]?.trim() || ''
export function databaseUrl() {
  const url = value('NUXT_DATABASE_URL')
  if (!url) throw new Error('Set NUXT_DATABASE_URL.')
  return url
}
export function postgresEnvironment(connection: string) {
  const url = new URL(connection)
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error('Use a PostgreSQL connection URL.')
  const env = { ...process.env, PGHOST: url.hostname.replace(/^\[|\]$/g, ''), PGPORT: url.port || '5432', PGUSER: decodeURIComponent(url.username), PGPASSWORD: decodeURIComponent(url.password), PGDATABASE: decodeURIComponent(url.pathname.slice(1)) }
  for (const [key, name] of Object.entries({ sslmode: 'PGSSLMODE', sslrootcert: 'PGSSLROOTCERT', sslcert: 'PGSSLCERT', sslkey: 'PGSSLKEY', connect_timeout: 'PGCONNECT_TIMEOUT', options: 'PGOPTIONS', channel_binding: 'PGCHANNELBINDING' })) {
    const parameter = url.searchParams.get(key)
    if (parameter) (env as NodeJS.ProcessEnv)[name] = parameter
  }
  return env
}
export function mediaStorage() {
  return createMediaStorage({ uploadDir: value('NUXT_UPLOAD_DIR') || './data/uploads', uploadStorage: 'r2', r2: r2Config() })
}
export function r2Config() {
  return { accountId: value('NUXT_R2_ACCOUNT_ID'), endpoint: value('NUXT_R2_ENDPOINT'), bucket: value('NUXT_R2_BUCKET'), prefix: value('NUXT_R2_PREFIX') || 'tebu/media', accessKeyId: value('NUXT_R2_ACCESS_KEY_ID'), secretAccessKey: value('NUXT_R2_SECRET_ACCESS_KEY') }
}
export function r2Client() {
  const r2 = r2Config()
  if ((!r2.accountId && !r2.endpoint) || !r2.bucket || !r2.accessKeyId || !r2.secretAccessKey) throw new Error('Configure R2 before running deployment operations.')
  return new S3Client({ region: 'auto', endpoint: r2ApiEndpoint(r2.endpoint) || `https://${r2.accountId}.r2.cloudflarestorage.com`, forcePathStyle: true, credentials: { accessKeyId: r2.accessKeyId, secretAccessKey: r2.secretAccessKey }, requestChecksumCalculation: 'WHEN_REQUIRED', responseChecksumValidation: 'WHEN_REQUIRED' })
}
export async function privateDirectory(path: string) {
  const directory = resolve(path); await mkdir(directory, { recursive: true, mode: 0o700 }); return directory
}
export async function run(command: string, args: string[], env = process.env) {
  // Database URLs stay in PGDATABASE, never in command arguments or logs.
  const child = spawn(command, args, { env, stdio: ['ignore', 'pipe', 'pipe'] })
  let output = ''
  let diagnostic = ''
  child.stdout.on('data', chunk => { output += chunk })
  child.stderr.on('data', chunk => { if (diagnostic.length < 4096) diagnostic += chunk })
  await new Promise<void>((resolve, reject) => {
    child.once('error', () => reject(new Error(`${command} is unavailable. Use the operations Docker image or install its prerequisites.`)))
    child.once('exit', code => {
      if (code === 0) return resolve()
      // Keep only the first tool error line; never include SQL COPY data or query text.
      let detail = diagnostic.split('\n').find(line => /^(pg_dump|pg_restore): error:/.test(line)) || ''
      for (const [name, secret] of Object.entries(env)) if (/KEY|TOKEN|PASSWORD|DATABASE_URL/.test(name) && secret) detail = detail.replaceAll(secret, '[redacted]')
      reject(new Error(`${command} failed. ${detail.slice(0, 300)}`))
    })
  })
  return output
}
