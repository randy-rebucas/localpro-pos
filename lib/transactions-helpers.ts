import type { Transaction } from '@/hooks/useTransactionsList';

export function getStatusColor(status: string): string {
  switch (status) {
    case 'completed':
      return 'bg-green-100 text-green-800 border-green-300';
    case 'refunded':
      return 'bg-orange-100 text-orange-800 border-orange-300';
    case 'cancelled':
      return 'bg-red-100 text-red-800 border-red-300';
    default:
      return 'bg-gray-100 text-gray-800 border-gray-300';
  }
}

export function formatStatusLabel(status: string, dict?: Record<string, unknown>): string {
  const statusMap: Record<string, string> = {
    completed: 'Completed',
    cancelled: 'Cancelled',
    refunded: 'Refunded',
  };

  if (dict && typeof dict.transactions === 'object' && dict.transactions && status in dict.transactions) {
    return String(dict.transactions[status as keyof typeof dict.transactions]);
  }

  if (dict && typeof dict.admin === 'object' && dict.admin && status in dict.admin) {
    return String(dict.admin[status as keyof typeof dict.admin]);
  }

  return statusMap[status] || status;
}

export function formatTransactionDate(createdAt: string): string {
  return new Date(createdAt).toLocaleString();
}

export function getItemCountLabel(count: number, dict?: Record<string, unknown>): string {
  if (count === 1) {
    if (dict && typeof dict.transactions === 'object' && dict.transactions && 'item' in dict.transactions) {
      return `${count} ${dict.transactions.item}`;
    }
    return '1 item';
  }
  if (dict && typeof dict.transactions === 'object' && dict.transactions && 'items' in dict.transactions) {
    return `${count} ${dict.transactions.items}`;
  }
  return `${count} items`;
}

export function formatPaymentMethod(method: string): string {
  const methodMap: Record<string, string> = {
    cash: 'Cash',
    card: 'Card',
    digital: 'Digital',
  };
  return methodMap[method] || method;
}

export function hasDiscount(transaction: Transaction): boolean {
  return !!(transaction.discountAmount && transaction.discountAmount > 0);
}

export function hasCashChange(transaction: Transaction): boolean {
  return (
    transaction.paymentMethod === 'cash' &&
    transaction.change !== undefined &&
    transaction.change > 0
  );
}

export function hasCashReceived(transaction: Transaction): boolean {
  return (
    transaction.paymentMethod === 'cash' &&
    transaction.cashReceived !== undefined &&
    transaction.cashReceived > 0
  );
}
