/**
 * Parameter validation helpers for automation/cron endpoints.
 *
 * Prevents invalid or unreasonable values from being passed to automations
 * (e.g., negative hours, absurdly large thresholds).
 */

/**
 * Validate and clamp a positive integer parameter.
 * Returns the clamped value or the default if undefined/invalid.
 */
export function positiveInt(
  value: unknown,
  defaultValue: number,
  max: number = 10000
): number {
  if (value === undefined || value === null) return defaultValue;
  const num = typeof value === 'string' ? parseInt(value, 10) : Number(value);
  if (isNaN(num) || num < 0) return defaultValue;
  return Math.min(num, max);
}

/**
 * Validate and clamp a positive float parameter.
 */
export function positiveFloat(
  value: unknown,
  defaultValue: number,
  max: number = 100000
): number {
  if (value === undefined || value === null) return defaultValue;
  const num = typeof value === 'string' ? parseFloat(value) : Number(value);
  if (isNaN(num) || num < 0) return defaultValue;
  return Math.min(num, max);
}

/**
 * Validate a MongoDB ObjectId string (24 hex chars).
 * Returns the string if valid, undefined otherwise.
 */
export function validObjectId(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  return /^[0-9a-fA-F]{24}$/.test(value) ? value : undefined;
}

/**
 * Validate a tenant ID from automation params.
 * Returns undefined if not a valid ObjectId, allowing tenant-wide operations.
 */
export function validTenantId(value: unknown): string | undefined {
  return validObjectId(value);
}
