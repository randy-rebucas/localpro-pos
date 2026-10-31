import connectDB from './mongodb';
import Counter, { dailyCounterExpiresAt } from '@/models/Counter';

/**
 * Get next sequence number for a per-day counter atomically using findOneAndUpdate.
 * `day` is the date the key was derived from; expiresAt is set only when the
 * counter is first created, so the TTL never moves and never hits the current day.
 */
async function getNextDailySequence(counterKey: string, day: Date): Promise<number> {
  const result = await Counter.findOneAndUpdate(
    { _id: counterKey },
    {
      $inc: { seq: 1 },
      $setOnInsert: { expiresAt: dailyCounterExpiresAt(day) },
    },
    { new: true, upsert: true }
  );
  return result!.seq;
}

function utcDateStr(day: Date): string {
  return day.toISOString().split('T')[0].replace(/-/g, '');
}

/**
 * Generate unique receipt number (atomic, no race conditions)
 * Format: REC-YYYYMMDD-XXXXX (e.g., REC-20241118-00001)
 */
export async function generateReceiptNumber(tenantId: string): Promise<string> {
  await connectDB();

  const today = new Date();
  const prefix = `REC-${utcDateStr(today)}`;
  const counterKey = `${prefix}-${tenantId}`;

  const seq = await getNextDailySequence(counterKey, today);
  return `${prefix}-${seq.toString().padStart(5, '0')}`;
}

export function isDuplicateReceiptNumberError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const err = error as { code?: number; message?: string };
  if (err.code === 11000) {
    const msg = (err.message || '').toLowerCase();
    return msg.includes('receiptnumber');
  }
  return false;
}

/**
 * Generate unique invoice number (atomic, no race conditions)
 * Format: INV-YYYYMMDD-XXXXX (e.g., INV-20241118-00001)
 */
export async function generateInvoiceNumber(tenantId: string): Promise<string> {
  await connectDB();

  const today = new Date();
  const prefix = `INV-${utcDateStr(today)}`;
  const counterKey = `${prefix}-${tenantId}`;

  const seq = await getNextDailySequence(counterKey, today);
  return `${prefix}-${seq.toString().padStart(5, '0')}`;
}
