/** Format live tenant count for the marketing trust strip. */
export function formatActiveTenants(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n) || n < 0) return '—';
  return new Intl.NumberFormat('en-US').format(Math.floor(n));
}

/** Format completed transaction total from the database, abbreviated (1.2K, 3.4M, 1B). */
export function formatCompletedTransactions(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n) || n < 0) return '—';
  const value = Math.floor(n);
  if (value < 1000) return String(value);

  const units = ['', 'K', 'M', 'B', 'T'];
  let tier = Math.min(Math.floor(Math.log10(value) / 3), units.length - 1);

  const format = (t: number) => {
    const scaled = value / 1000 ** t;
    return scaled >= 100 ? Math.round(scaled).toString() : scaled.toFixed(1).replace(/\.0$/, '');
  };

  let formatted = format(tier);
  // Rounding can push e.g. 999,999 to "1000K" — bump to the next tier so it reads "1M".
  if (parseFloat(formatted) >= 1000 && tier < units.length - 1) {
    tier += 1;
    formatted = format(tier);
  }

  return `${formatted}${units[tier]}`;
}
