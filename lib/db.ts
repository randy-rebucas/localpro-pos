import { PrismaClient } from '@prisma/client';
import { logger } from '@/lib/logger';

declare global {
  var prisma: PrismaClient | undefined;
}

const prisma =
  globalThis.prisma ??
  new PrismaClient({
    log: [
      { level: 'error', emit: 'event' },
      { level: 'warn', emit: 'event' },
    ],
  });

if (process.env.NODE_ENV !== 'production') {
  globalThis.prisma = prisma;
}

prisma.$on('error' as never, (e: unknown) => {
  logger.error('Postgres error', e as Record<string, unknown>);
});

prisma.$on('warn' as never, (e: unknown) => {
  logger.warn('Postgres warning', e as Record<string, unknown>);
});

export default prisma;
