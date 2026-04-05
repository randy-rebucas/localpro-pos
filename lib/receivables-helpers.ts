import type { Receivable } from '@/hooks/useReceivablesList';

interface StatusFilterOption {
  value: string;
  label: string;
  color: string;
  bgColor: string;
}

export const STATUS_FILTERS: Record<string, StatusFilterOption> = {
  pending: {
    value: 'pending',
    label: 'Pending',
    color: 'text-yellow-700',
    bgColor: 'bg-yellow-50',
  },
  partial: {
    value: 'partial',
    label: 'Partial',
    color: 'text-blue-700',
    bgColor: 'bg-blue-50',
  },
  paid: {
    value: 'paid',
    label: 'Paid',
    color: 'text-green-700',
    bgColor: 'bg-green-50',
  },
  overdue: {
    value: 'overdue',
    label: 'Overdue',
    color: 'text-red-700',
    bgColor: 'bg-red-50',
  },
  cancelled: {
    value: 'cancelled',
    label: 'Cancelled',
    color: 'text-gray-700',
    bgColor: 'bg-gray-50',
  },
};

export function getStatusColor(status: string) {
  const statusOption = STATUS_FILTERS[status];
  return statusOption
    ? { color: statusOption.color, bgColor: statusOption.bgColor, label: statusOption.label }
    : { color: 'text-gray-700', bgColor: 'bg-gray-50', label: status };
}

export function getDaysUntilDue(dueDate: string): number {
  const due = new Date(dueDate);
  const today = new Date();
  const diffTime = due.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
}

export function formatDueDate(dueDate: string): {
  formatted: string;
  days: number;
  display: string;
  style: 'overdue' | 'urgent' | 'normal';
} {
  const due = new Date(dueDate);
  const daysLeft = getDaysUntilDue(dueDate);

  const formatted = due.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  let display = `${daysLeft} days left`;
  let style: 'overdue' | 'urgent' | 'normal' = 'normal';

  if (daysLeft < 0) {
    display = `${Math.abs(daysLeft)} days overdue`;
    style = 'overdue';
  } else if (daysLeft === 0) {
    display = '🔔 Due today';
    style = 'urgent';
  } else if (daysLeft < 7) {
    style = 'urgent';
  }

  return { formatted, days: daysLeft, display, style };
}

export function getOutstandingColor(amount: number): string {
  return amount > 0 ? '#dc2626' : '#16a34a';
}

export function formatCustomerName(receivable: Receivable): string {
  return `${receivable.customerId.firstName} ${receivable.customerId.lastName}`;
}

export function filterReceivablesBySearch(
  items: Receivable[],
  searchTerm: string
): Receivable[] {
  if (!searchTerm) return items;

  const term = searchTerm.toLowerCase();
  return items.filter((item) =>
    item.customerId.firstName.toLowerCase().includes(term) ||
    item.customerId.lastName.toLowerCase().includes(term) ||
    item.customerId.email?.toLowerCase().includes(term) ||
    item.transactionId.receiptNumber.toLowerCase().includes(term)
  );
}
