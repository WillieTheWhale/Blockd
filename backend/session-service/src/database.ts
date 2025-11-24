import { PrismaClient } from '@prisma/client';
import { config } from './config';

// Prisma client singleton
let prisma: PrismaClient;

export function getPrismaClient(): PrismaClient {
  if (!prisma) {
    prisma = new PrismaClient({
      log: config.nodeEnv === 'development' ? ['query', 'error', 'warn'] : ['error'],
      datasources: {
        db: {
          url: config.databaseUrl,
        },
      },
    });

    // Handle graceful shutdown
    process.on('beforeExit', async () => {
      await prisma.$disconnect();
    });
  }

  return prisma;
}

export async function disconnectDatabase(): Promise<void> {
  if (prisma) {
    await prisma.$disconnect();
  }
}

export default getPrismaClient();
