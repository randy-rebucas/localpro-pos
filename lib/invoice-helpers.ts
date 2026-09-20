/**
 * Invoice Utilities
 * Helper functions for status formatting and transition rules
 * (pattern-matched to lib/deposit-helpers.ts)
 */

export const INVOICE_STATUSES = [
  { value: 'draft', label: 'Draft' },
  { value: 'sent', label: 'Sent' },
  { value: 'paid', label: 'Paid' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'cancelled', label: 'Cancelled' },
] as const;

export type InvoiceStatus = typeof INVOICE_STATUSES[number]['value'];

export function getInvoiceStatusColor(status: InvoiceStatus): string {
  switch (status) {
    case 'draft':
      return 'bg-gray-100 text-gray-800';
    case 'sent':
      return 'bg-blue-100 text-blue-800';
    case 'paid':
      return 'bg-green-100 text-green-800';
    case 'overdue':
      return 'bg-red-100 text-red-800';
    case 'cancelled':
      return 'bg-gray-100 text-gray-500';
    default:
      return 'bg-gray-100 text-gray-800';
  }
}

type Dict = Record<string, Record<string, string | undefined> | undefined>;

export function getInvoiceStatusLabel(status: InvoiceStatus, dict?: Dict): string {
  const labels: Record<InvoiceStatus, string> = {
    draft: dict?.admin?.invoiceStatusDraft || 'Draft',
    sent: dict?.admin?.invoiceStatusSent || 'Sent',
    paid: dict?.admin?.invoiceStatusPaid || 'Paid',
    overdue: dict?.admin?.invoiceStatusOverdue || 'Overdue',
    cancelled: dict?.admin?.invoiceStatusCancelled || 'Cancelled',
  };
  return labels[status] || status;
}

/**
 * Allowed invoice status transitions.
 * Pipeline: draft -> sent -> paid (money received) or sent -> overdue (past
 * due date, unpaid) or sent/overdue -> cancelled (written off). draft can
 * also be cancelled outright. paid/cancelled are terminal.
 */
const ALLOWED_INVOICE_STATUS_TRANSITIONS: Record<InvoiceStatus, InvoiceStatus[]> = {
  draft: ['draft', 'sent', 'cancelled'],
  sent: ['sent', 'paid', 'overdue', 'cancelled'],
  overdue: ['overdue', 'paid', 'cancelled'],
  paid: ['paid'],
  cancelled: ['cancelled'],
};

export function isValidInvoiceStatusTransition(from: InvoiceStatus, to: InvoiceStatus): boolean {
  return ALLOWED_INVOICE_STATUS_TRANSITIONS[from]?.includes(to) ?? false;
}

export function getAllowedNextInvoiceStatuses(from: InvoiceStatus): InvoiceStatus[] {
  return ALLOWED_INVOICE_STATUS_TRANSITIONS[from] ?? [from];
}

export function isInvoiceStatusEditable(status: InvoiceStatus): boolean {
  return getAllowedNextInvoiceStatuses(status).length > 1;
}

export function isInvoiceOverdue(status: InvoiceStatus, dueDate: string): boolean {
  return (status === 'sent' || status === 'draft') && new Date(dueDate).getTime() < Date.now();
}
