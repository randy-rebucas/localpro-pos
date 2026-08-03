import prisma from '@/lib/prisma';

/**
 * Atomically increments (creating at 1 if absent) and returns the new value
 * for a named counter. Single upsert statement guarantees atomicity under
 * concurrent callers.
 */
export async function getNextSequence(counterKey: string): Promise<number> {
  const rows = await prisma.$queryRaw<{ seq: number }[]>`
    INSERT INTO counters (counter_key, seq)
    VALUES (${counterKey}, 1)
    ON CONFLICT (counter_key) DO UPDATE SET seq = counters.seq + 1
    RETURNING seq
  `;
  return rows[0].seq;
}
