import { productionConfigIssues } from '../server/deployment/config.ts'

const value = key => process.env[key]?.trim() || ''
const issues = productionConfigIssues({ deploymentMode: value('NUXT_DEPLOYMENT_MODE') || 'production', databaseUrl: value('NUXT_DATABASE_URL'), siteUrl: value('NUXT_SITE_URL'), adminKey: value('NUXT_ADMIN_KEY'), uploadStorage: value('NUXT_UPLOAD_STORAGE'), public: { demo: value('NUXT_PUBLIC_DEMO') || 'false', testingCalendar: value('NUXT_PUBLIC_TESTING_CALENDAR') || 'false' }, r2: { accountId: value('NUXT_R2_ACCOUNT_ID'), endpoint: value('NUXT_R2_ENDPOINT'), accessKeyId: value('NUXT_R2_ACCESS_KEY_ID'), secretAccessKey: value('NUXT_R2_SECRET_ACCESS_KEY'), bucket: value('NUXT_R2_BUCKET') } })
if (issues.length) { console.error(issues.join('\n')); process.exit(1) }
await import('../.output/server/index.mjs')
