import { productionConfigIssues } from '../server/deployment/config'
import { value, r2Config } from './lib/operations'
const issues = productionConfigIssues({ deploymentMode: 'production', databaseUrl: value('NUXT_DATABASE_URL'), siteUrl: value('NUXT_SITE_URL'), adminKey: value('NUXT_ADMIN_KEY'), uploadStorage: value('NUXT_UPLOAD_STORAGE'), public: { demo: value('NUXT_PUBLIC_DEMO'), testingCalendar: value('NUXT_PUBLIC_TESTING_CALENDAR') }, r2: r2Config() })
if (Buffer.from(value('TEBU_BACKUP_ENCRYPTION_KEY'), 'base64').length !== 32) issues.push('Set a base64-encoded 32-byte TEBU_BACKUP_ENCRYPTION_KEY and save it separately.')
if (issues.length) { console.error(issues.join('\n')); process.exitCode = 1 }
else console.log('Production configuration checks passed. Verify database, storage, backup and HTTPS flows before opening orders.')
