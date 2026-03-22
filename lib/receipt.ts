import connectDB from './mongodb';
import mongoose from 'mongoose';

// Counter schema for atomic sequence generation
const CounterSchema = new mongoose.Schema({
  _id: { type: String, required: true }, // e.g., "REC-20241118-tenantId" or "INV-20241118-tenantId"
  seq: { type: Number, default: 0 },
});

const Counter = mongoose.models.Counter || mongoose.model('Counter', CounterSchema);

/**
 * Get next sequence number atomically using MongoDB findOneAndUpdate
 */
async function getNextSequence(counterKey: string): Promise<number> {
  const result = await Counter.findOneAndUpdate(
    { _id: counterKey },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  return result.seq;
}

/**
 * Generate unique receipt number (atomic, no race conditions)
 * Format: REC-YYYYMMDD-XXXXX (e.g., REC-20241118-00001)
 */
export async function generateReceiptNumber(tenantId: string): Promise<string> {
  await connectDB();

  const today = new Date();
  const dateStr = today.toISOString().split('T')[0].replace(/-/g, '');
  const prefix = `REC-${dateStr}`;
  const counterKey = `${prefix}-${tenantId}`;

  const seq = await getNextSequence(counterKey);
  return `${prefix}-${seq.toString().padStart(5, '0')}`;
}

/**
 * Generate unique invoice number (atomic, no race conditions)
 * Format: INV-YYYYMMDD-XXXXX (e.g., INV-20241118-00001)
 */
export async function generateInvoiceNumber(tenantId: string): Promise<string> {
  await connectDB();

  const today = new Date();
  const dateStr = today.toISOString().split('T')[0].replace(/-/g, '');
  const prefix = `INV-${dateStr}`;
  const counterKey = `${prefix}-${tenantId}`;

  const seq = await getNextSequence(counterKey);
  return `${prefix}-${seq.toString().padStart(5, '0')}`;
}
