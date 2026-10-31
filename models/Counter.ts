import mongoose, { Schema, Model } from 'mongoose';

/**
 * Atomic sequence counters used by lib/receipt.ts.
 *
 * Keys are per tenant per UTC day per prefix, e.g. "REC-20241118-<tenantId>" or
 * "INV-20241118-<tenantId>". Once the day is over the key is never touched again,
 * so each counter gets an `expiresAt` (set on insert only) a safe window after
 * its day ends and is removed by the TTL index below.
 *
 * Counters without `expiresAt` (legacy rows, or any future non-daily sequence)
 * are never expired: MongoDB TTL ignores documents missing the indexed field.
 */
export interface ICounter {
  _id: string;
  seq: number;
  expiresAt?: Date;
}

const CounterSchema = new Schema<ICounter>({
  _id: { type: String, required: true },
  seq: { type: Number, default: 0 },
  expiresAt: { type: Date },
});

// TTL: delete a daily counter once its expiresAt passes.
CounterSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

/** Days a daily counter is kept after the start of its (UTC) day. */
export const DAILY_COUNTER_RETENTION_DAYS = 8;

/**
 * Expiry for a counter whose key is for the UTC day containing `day`.
 * Always at least 7 full days after that day ends, so a counter that is still
 * in use (current day) can never be expired and restart its sequence.
 */
export function dailyCounterExpiresAt(day: Date): Date {
  const startOfDayUtc = Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate());
  return new Date(startOfDayUtc + DAILY_COUNTER_RETENTION_DAYS * 24 * 60 * 60 * 1000);
}

const Counter: Model<ICounter> =
  (mongoose.models.Counter as Model<ICounter>) || mongoose.model<ICounter>('Counter', CounterSchema);

export default Counter;
