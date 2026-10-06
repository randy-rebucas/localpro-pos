/**
 * Subscriptions page helper functions
 */

export function formatDate(value: string | Date | undefined | null): string {
  if (!value) return '—';
  const d = new Date(value);
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

// Win8 flat badges: solid fill, white text (see .claude/skills/super-admin-ui).
const SUBSCRIPTION_STATUS_BADGE: Record<string, string> = {
  active: 'bg-win8-success text-white',
  inactive: 'bg-gray-500 text-white',
  trial: 'bg-win8-warning text-white',
  suspended: 'bg-win8-suspended text-white',
  cancelled: 'bg-win8-danger text-white',
};

export function getSubscriptionStatusBadgeStyles(status: string): string {
  return SUBSCRIPTION_STATUS_BADGE[status] || 'bg-gray-500 text-white';
}

export function getSubscriptionStatusLabel(status: string, dict: any): string { // eslint-disable-line @typescript-eslint/no-explicit-any
  const labels: Record<string, string> = {
    active: dict?.admin?.active || 'Active',
    inactive: dict?.admin?.inactive || 'Inactive',
    trial: dict?.admin?.trial || 'Trial',
    suspended: dict?.admin?.suspended || 'Suspended',
    cancelled: dict?.admin?.cancelled || 'Cancelled',
  };
  return labels[status] || status;
}

const BILLING_STATUS_BADGE: Record<string, string> = {
  paid: 'bg-win8-success text-white',
  pending: 'bg-win8-warning text-white',
  failed: 'bg-win8-danger text-white',
  refunded: 'bg-win8-suspended text-white',
};

export function getBillingTransactionStatusBadgeStyles(status: string): string {
  return BILLING_STATUS_BADGE[status] || 'bg-gray-500 text-white';
}

export function getBillingTransactionStatusLabel(status: string, dict?: any): string { // eslint-disable-line @typescript-eslint/no-explicit-any
  const labels: Record<string, string | undefined> = {
    paid: dict?.admin?.statusPaid,
    pending: dict?.admin?.statusPending,
    failed: dict?.admin?.statusFailed,
    refunded: dict?.admin?.statusRefunded,
  };
  return labels[status] || status.charAt(0).toUpperCase() + status.slice(1);
}
