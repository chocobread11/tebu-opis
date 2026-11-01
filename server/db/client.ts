import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../../generated/prisma/client'

export function createDatabase(connectionString: string) {
  const adapter = new PrismaPg({
    connectionString,
    max: 5,
    idleTimeoutMillis: 20_000,
    connectionTimeoutMillis: 10_000,
  })
  return new PrismaClient({ adapter })
}
