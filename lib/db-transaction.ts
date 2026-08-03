import { Prisma, PrismaClient } from '@prisma/client';
import prisma from '@/lib/prisma';

export type PrismaTx = Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>;

/**
 * Runs writes inside a Postgres transaction. Serializable isolation because
 * checkout/refund/stock-adjustment flows read a product's current stock and
 * write a decremented value back — under the weaker default (Read Committed)
 * two concurrent checkouts could both read the same stock and oversell.
 */
export async function runInTransaction<T>(
  run: (tx: PrismaTx) => Promise<T>
): Promise<T> {
  return prisma.$transaction(run, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
