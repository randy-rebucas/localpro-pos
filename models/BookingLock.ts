import mongoose, { Schema, Model } from 'mongoose';

/**
 * One document per tenant that every booking create/reschedule writes inside
 * its transaction (lib/booking-lock.ts). MongoDB's snapshot isolation does not
 * stop two transactions that each read "slot free" and insert different
 * bookings; making both write this same document turns that into a write
 * conflict, so one retries (withTransaction) and its conflict check then sees
 * the other's booking. Keyed by _id, so it needs no extra index.
 */
export interface IBookingLock {
  _id: string;
  n: number;
}

const BookingLockSchema = new Schema<IBookingLock>(
  {
    _id: { type: String, required: true },
    n: { type: Number, default: 0 },
  },
  { versionKey: false }
);

const BookingLock: Model<IBookingLock> =
  (mongoose.models.BookingLock as Model<IBookingLock>) || mongoose.model<IBookingLock>('BookingLock', BookingLockSchema);

export default BookingLock;
