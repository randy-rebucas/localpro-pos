/**
 * Formats the Grand Total accumulator as a zero-padded 10-digit register
 * string (e.g. "0000012505.50"), matching the fixed-width GT display
 * convention on physical BIR-registered cash registers/POS terminals.
 *
 * Client-safe (no server/model imports) — usable from both API routes and
 * client components.
 */
export function formatGrandTotalRegister(amount: number): string {
  const [integerPart, decimalPart = '00'] = amount.toFixed(2).split('.');
  return `${integerPart.padStart(10, '0')}.${decimalPart}`;
}
