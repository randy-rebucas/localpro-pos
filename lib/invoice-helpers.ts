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

// Win8 solid badge fills (white text on design tokens).
const INVOICE_STATUS_BADGE: Record<string, string> = {
  draft: 'bg-win8-warning text-white',
  sent: 'bg-win8-info text-white',
  paid: 'bg-win8-success text-white',
  overdue: 'bg-win8-danger text-white',
  cancelled: 'bg-gray-500 text-white',
};

export function getInvoiceStatusColor(status: InvoiceStatus): string {
  return INVOICE_STATUS_BADGE[status] || 'bg-gray-500 text-white';
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
