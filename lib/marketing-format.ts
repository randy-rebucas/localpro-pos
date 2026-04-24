/** Format live tenant count for the marketing trust strip. */
export function formatActiveTenants(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n) || n < 0) return '—';
  return new Intl.NumberFormat('en-US').format(Math.floor(n));
}

/** Format completed transaction total from the database (exact, no rounding hype). */
export function formatCompletedTransactions(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n) || n < 0) return '—';
  return new Intl.NumberFormat('en-US').format(Math.floor(n));
}
