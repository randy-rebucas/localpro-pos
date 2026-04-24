/**
 * Subscriptions page helper functions
 */

export function formatDate(value: string | Date | undefined | null): string {
  if (!value) return '—';
  const d = new Date(value);
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function getSubscriptionStatusBadgeStyles(status: string): string {
  const styles: Record<string, string> = {
    active: 'bg-green-100 text-green-800',
    inactive: 'bg-gray-100 text-gray-800',
    trial: 'bg-brand-soft text-brand-navy',
    suspended: 'bg-yellow-100 text-yellow-800',
    cancelled: 'bg-red-100 text-red-800',
  };
  return styles[status] || 'bg-gray-100 text-gray-800';
}

export function getSubscriptionStatusLabel(status: string, dict: any): string { // eslint-disable-line @typescript-eslint/no-explicit-any
  const labels: Record<string, string> = {
    active: dict?.admin?.active || 'Active',
    inactive: dict?.admin?.inactive || 'Inactive',
    trial: dict?.admin?.trial || 'Trial',
    suspended: dict?.admin?.suspended || 'Suspended',
    cancelled: 'Cancelled',
  };
  return labels[status] || status;
}

export function getBillingTransactionStatusBadgeStyles(status: string): string {
  const styles: Record<string, string> = {
    paid: 'bg-green-100 text-green-800',
    pending: 'bg-yellow-100 text-yellow-800',
    failed: 'bg-red-100 text-red-800',
    refunded: 'bg-gray-100 text-gray-800',
  };
  return styles[status] || 'bg-gray-100 text-gray-800';
}

export function getBillingTransactionStatusLabel(status: string): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export function getBillingTransactionIconStyles(status: string): string {
  const styles: Record<string, string> = {
    paid: 'bg-green-100 text-green-600',
    pending: 'bg-yellow-100 text-yellow-600',
    failed: 'bg-red-100 text-red-600',
    refunded: 'bg-gray-100 text-gray-600',
  };
  return styles[status] || 'bg-gray-100 text-gray-600';
}
