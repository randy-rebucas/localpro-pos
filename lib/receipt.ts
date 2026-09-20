import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import { dbTransaction } from '@/lib/db';

/**
 * Get next sequence number atomically using an upsert + increment.
 * Postgres executes `INSERT ... ON CONFLICT DO UPDATE SET value = value + 1`
 * as a single atomic statement, matching Mongo's `findOneAndUpdate({ $inc })`
 * semantics — no read-then-write race between concurrent callers.
 */
async function getNextSequence(tenantId: string, counterKey: string): Promise<number> {
  const counter = await dbTransaction(async (tx) => {
    return tx.counter.upsert({
      where: { tenantId_key: { tenantId, key: counterKey } },
      update: { value: { increment: 1 } },
      create: { id: randomUUID(), tenantId, key: counterKey, value: 1 },
    });
  });
  return counter.value;
}

/**
 * Generate unique receipt number (atomic, no race conditions)
 * Format: REC-YYYYMMDD-XXXXX (e.g., REC-20241118-00001)
 */
export async function generateReceiptNumber(tenantId: string): Promise<string> {
  const today = new Date();
  const dateStr = today.toISOString().split('T')[0].replace(/-/g, '');
  const prefix = `REC-${dateStr}`;

  const seq = await getNextSequence(tenantId, prefix);
  return `${prefix}-${seq.toString().padStart(5, '0')}`;
}

export function isDuplicateReceiptNumberError(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    const target = error.meta?.target;
    const targetStr = Array.isArray(target) ? target.join(',').toLowerCase() : String(target ?? '').toLowerCase();
    return targetStr.includes('receiptnumber');
  }
  // Fallback for the pre-migration Mongo duplicate-key shape, in case any
  // caller still surfaces a raw Mongo error during the cutover window.
  if (error && typeof error === 'object') {
    const err = error as { code?: number; message?: string };
    if (err.code === 11000) {
      const msg = (err.message || '').toLowerCase();
      return msg.includes('receiptnumber');
    }
  }
  return false;
}

/**
 * Generate unique invoice number (atomic, no race conditions)
 * Format: INV-YYYYMMDD-XXXXX (e.g., INV-20241118-00001)
 */
export async function generateInvoiceNumber(tenantId: string): Promise<string> {
  const today = new Date();
  const dateStr = today.toISOString().split('T')[0].replace(/-/g, '');
  const prefix = `INV-${dateStr}`;

  const seq = await getNextSequence(tenantId, prefix);
  return `${prefix}-${seq.toString().padStart(5, '0')}`;
}
