/** Server-side time limits, so a slow query fails instead of tying up the database. */
export const REPORT_MAX_TIME_MS = 30_000;
/** For non-critical reads on the POS screen, where a quick failure is better than a wait. */
export const INTERACTIVE_MAX_TIME_MS = 3_000;

/** Upper bound for lists that clients load in full. Responses report `truncated` when it's hit. */
export const LIST_SAFETY_CAP = 1_000;

/** Escapes user input so it matches literally when used in a `$regex`. */
export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
