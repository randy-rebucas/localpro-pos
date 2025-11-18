import connectDB from './mongodb';
import Transaction from '@/models/Transaction';

/**
 * Generate unique receipt number
 * Format: REC-YYYYMMDD-XXXXX (e.g., REC-20241118-00001)
 */
export async function generateReceiptNumber(tenantId: string): Promise<string> {
  await connectDB();
  
  const today = new Date();
  const dateStr = today.toISOString().split('T')[0].replace(/-/g, '');
  const prefix = `REC-${dateStr}-`;

  // Find the last receipt number for today
  const lastReceipt = await Transaction.findOne({
    tenantId,
    receiptNumber: { $regex: `^${prefix}` },
  })
    .sort({ receiptNumber: -1 })
    .select('receiptNumber')
    .lean();

  let sequence = 1;
  if (lastReceipt?.receiptNumber) {
    const lastSeq = parseInt(lastReceipt.receiptNumber.split('-')[2] || '0', 10);
    sequence = lastSeq + 1;
  }

  const receiptNumber = `${prefix}${sequence.toString().padStart(5, '0')}`;
  return receiptNumber;
}

