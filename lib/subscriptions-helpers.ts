/**
 * Subscriptions page helper functions
 */

type Dict = { admin?: Record<string, string | undefined> } | null | undefined;

export function formatDate(value: string | Date | undefined | null, timeZone?: string, locale?: string): string {
  if (!value) return '—';
  const d = new Date(value);
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString(locale, { year: 'numeric', month: 'short', day: 'numeric', timeZone });
}

/** Whole days from now until `value`, never below zero; null when there is no date. */
export function daysUntil(value: string | Date | undefined | null, now: Date = new Date()): number | null {
  if (!value) return null;
  const d = new Date(value);
  if (isNaN(d.getTime())) return null;
  return Math.max(0, Math.ceil((d.getTime() - now.getTime()) / 86_400_000));
}

/** An amount in its own currency, e.g. ₱1,499.00, falling back to the code when Intl does not know it. */
export function formatMoney(amount: number, currency: string | undefined, locale?: string): string {
  const code = (currency || 'PHP').toUpperCase();
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency: code, currencyDisplay: 'narrowSymbol' }).format(amount);
  } catch {
    return `${code} ${amount.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
}

export function getSubscriptionStatusLabel(status: string, dict: Dict): string {
  const labels: Record<string, string> = {
    active: dict?.admin?.active || 'Active',
    inactive: dict?.admin?.inactive || 'Inactive',
    trial: dict?.admin?.trial || 'Trial',
    suspended: dict?.admin?.suspended || 'Suspended',
    cancelled: dict?.admin?.cancelled || 'Cancelled',
    paused: dict?.admin?.subscriptionPaused || 'Paused',
  };
  return labels[status] || status;
}

export function getBillingStatusLabel(status: string, dict: Dict): string {
  const labels: Record<string, string> = {
    paid: dict?.admin?.statusPaid || 'Paid',
    pending: dict?.admin?.statusPending || 'Pending',
    failed: dict?.admin?.statusFailed || 'Failed',
    refunded: dict?.admin?.statusRefunded || 'Refunded',
  };
  return labels[status] || status;
}
