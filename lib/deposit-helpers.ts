/**
 * Deposit Utilities
 * Helper functions for status formatting and transition rules
 * (pattern-matched to lib/work-order-helpers.ts)
 */

export const DEPOSIT_STATUSES = [
  { value: 'pending', label: 'Pending' },
  { value: 'paid', label: 'Paid' },
  { value: 'applied', label: 'Applied' },
  { value: 'refunded', label: 'Refunded' },
  { value: 'forfeited', label: 'Forfeited' },
  { value: 'cancelled', label: 'Cancelled' },
] as const;

export type DepositStatus = typeof DEPOSIT_STATUSES[number]['value'];

/** Solid Win8 badge fill per status (white text on every token). */
const DEPOSIT_STATUS_BADGE: Record<DepositStatus, string> = {
  pending: 'bg-win8-warning text-white',
  paid: 'bg-win8-info text-white',
  applied: 'bg-win8-success text-white',
  refunded: 'bg-win8-suspended text-white',
  forfeited: 'bg-win8-danger text-white',
  cancelled: 'bg-gray-500 text-white',
};

export function getDepositStatusColor(status: DepositStatus): string {
  return DEPOSIT_STATUS_BADGE[status] || 'bg-gray-500 text-white';
}

type Dict = Record<string, Record<string, string | undefined> | undefined>;

export function getDepositStatusLabel(status: DepositStatus, dict?: Dict): string {
  const labels: Record<DepositStatus, string> = {
    pending: dict?.admin?.pending || 'Pending',
    paid: dict?.admin?.paid || 'Paid',
    applied: dict?.admin?.applied || 'Applied',
    refunded: dict?.admin?.refunded || 'Refunded',
    forfeited: dict?.admin?.forfeited || 'Forfeited',
    cancelled: dict?.admin?.cancelled || 'Cancelled',
  };
  return labels[status] || status;
}

/**
 * Allowed deposit status transitions.
 * Pipeline: pending -> paid -> applied (consumed by an invoice) or
 * paid -> refunded (returned to customer) or paid -> forfeited (kept, no
 * refund — e.g. no-show). pending can also be cancelled outright before
 * any money changes hands. applied/refunded/forfeited/cancelled are terminal.
 */
const ALLOWED_DEPOSIT_STATUS_TRANSITIONS: Record<DepositStatus, DepositStatus[]> = {
  pending: ['pending', 'paid', 'cancelled'],
  paid: ['paid', 'applied', 'refunded', 'forfeited'],
  applied: ['applied'],
  refunded: ['refunded'],
  forfeited: ['forfeited'],
  cancelled: ['cancelled'],
};

export function isValidDepositStatusTransition(from: DepositStatus, to: DepositStatus): boolean {
  return ALLOWED_DEPOSIT_STATUS_TRANSITIONS[from]?.includes(to) ?? false;
}

export function getAllowedNextDepositStatuses(from: DepositStatus): DepositStatus[] {
  return ALLOWED_DEPOSIT_STATUS_TRANSITIONS[from] ?? [from];
}

export function isDepositStatusEditable(status: DepositStatus): boolean {
  return getAllowedNextDepositStatuses(status).length > 1;
}
