import type { CreditTransaction } from '@/hooks/useCreditsManager';

export function formatCreditType(type: string): string {
  const types: Record<string, string> = {
    top_up: 'Top Up',
    usage: 'Usage',
    refund: 'Refund',
    adjustment: 'Adjustment',
  };
  return types[type] || type;
}

export function getCreditTypeColor(type: string): { bgColor: string; textColor: string } {
  const colors: Record<string, { bgColor: string; textColor: string }> = {
    top_up: { bgColor: 'bg-green-50', textColor: 'text-green-700' },
    usage: { bgColor: 'bg-orange-50', textColor: 'text-orange-700' },
    refund: { bgColor: 'bg-blue-50', textColor: 'text-blue-700' },
    adjustment: { bgColor: 'bg-yellow-50', textColor: 'text-yellow-700' },
  };
  return colors[type] || { bgColor: 'bg-gray-50', textColor: 'text-gray-700' };
}

export function validateCreditAmount(amount: string): { valid: boolean; error?: string } {
  const parsed = parseFloat(amount);
  if (isNaN(parsed)) {
    return { valid: false, error: 'Invalid amount' };
  }
  if (parsed <= 0) {
    return { valid: false, error: 'Amount must be greater than 0' };
  }
  return { valid: true };
}

export function formatCustomerName(firstName: string, lastName: string): string {
  return `${firstName} ${lastName}`.trim();
}

export function getCustomerContact(email?: string, phone?: string): string {
  return email || phone || 'No contact';
}

export function sortTransactionsByDate(transactions: CreditTransaction[]): CreditTransaction[] {
  return [...transactions].sort((a, b) => {
    const dateA = new Date(a.createdAt).getTime();
    const dateB = new Date(b.createdAt).getTime();
    return dateB - dateA;
  });
}
