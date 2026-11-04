import { getRepos, isDuplicateKeyError } from '@/lib/db';

/**
 * Generate unique receipt number (atomic, no race conditions)
 * Format: REC-YYYYMMDD-XXXXX (e.g., REC-20241118-00001)
 */
export async function generateReceiptNumber(tenantId: string): Promise<string> {
  const today = new Date();
  const dateStr = today.toISOString().split('T')[0].replace(/-/g, '');
  const prefix = `REC-${dateStr}`;
  const counterKey = `${prefix}-${tenantId}`;

  const seq = await getRepos().counters.next(counterKey);
  return `${prefix}-${seq.toString().padStart(5, '0')}`;
}

export function isDuplicateReceiptNumberError(error: unknown): boolean {
  if (!isDuplicateKeyError(error)) return false;
  const { field, message } = error as { field?: string; message?: string };
  return field === 'receiptNumber' || (message || '').toLowerCase().includes('receiptnumber');
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

  const seq = await getRepos().counters.next(counterKey);
  return `${prefix}-${seq.toString().padStart(5, '0')}`;
}
