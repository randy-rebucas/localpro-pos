import { Prisma } from '@prisma/client';
import { getNextSequence } from '@/lib/data/counters';

/**
 * Generate unique receipt number (atomic, no race conditions)
 * Format: REC-YYYYMMDD-XXXXX (e.g., REC-20241118-00001)
 */
export async function generateReceiptNumber(tenantId: string): Promise<string> {
  const today = new Date();
  const dateStr = today.toISOString().split('T')[0].replace(/-/g, '');
  const prefix = `REC-${dateStr}`;
  const counterKey = `${prefix}-${tenantId}`;

  const seq = await getNextSequence(counterKey);
  return `${prefix}-${seq.toString().padStart(5, '0')}`;
}

export function isDuplicateReceiptNumberError(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    const target = (error.meta?.target as string[] | string | undefined) ?? '';
    const targetStr = Array.isArray(target) ? target.join(',') : String(target);
    return targetStr.toLowerCase().includes('receipt_number') || targetStr.toLowerCase().includes('receiptnumber');
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
  const counterKey = `${prefix}-${tenantId}`;

  const seq = await getNextSequence(counterKey);
  return `${prefix}-${seq.toString().padStart(5, '0')}`;
}
