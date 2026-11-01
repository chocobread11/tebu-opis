import 'dotenv/config'
import { defineConfig } from 'prisma/config'

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'node --import tsx scripts/seed.ts',
  },
  // Generation and demo builds also work without a database URL.
  datasource: { url: process.env.NUXT_DATABASE_URL || '' },
})
