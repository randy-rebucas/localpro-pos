import type mongoose from 'mongoose';
import BookingLock from '@/models/BookingLock';

const lockId = (tenantId: string) => `booking:${tenantId}`;

/**
 * Makes sure the tenant's lock document exists. Run before the transaction:
 * two concurrent upserts creating it inside transactions would fail with a
 * duplicate key (not a retryable error) instead of a write conflict.
 */
export async function ensureBookingLock(tenantId: string): Promise<void> {
  try {
    await BookingLock.updateOne({ _id: lockId(tenantId) }, { $setOnInsert: { n: 0 } }, { upsert: true });
  } catch (error) {
    if ((error as { code?: number }).code !== 11000) throw error;
  }
}

/**
 * Take the tenant's booking lock inside `session`'s transaction. Call it before
 * the conflict check: concurrent transactions that both write it conflict, and
 * withTransaction retries the loser after the winner commits.
 */
export async function takeBookingLock(tenantId: string, session: mongoose.ClientSession): Promise<void> {
  await BookingLock.updateOne({ _id: lockId(tenantId) }, { $inc: { n: 1 } }, { session });
}
