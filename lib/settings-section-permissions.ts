/**
 * Per-section permissions for PUT /api/tenants/[slug]/settings.
 *
 * Several admin pages (Hardware, Branding, Multi-Currency, Feature Flags) save
 * through the one shared settings route. Each owns a section of keys and has
 * its own permission key, so a tenant can grant e.g. Branding without granting
 * every setting (and revoke it without blocking the main Settings page).
 *
 * Rule: for every submitted key whose stored value would actually change, the
 * user needs one of that key's permissions; keys not listed here fall back to
 * `settings.manage`. Comparing against the stored row (rather than "is the key
 * present") matters because the main Settings page posts the whole settings
 * object — a manager without `feature_flags.manage` must still be able to save
 * it as long as the feature flags it carries are unchanged.
 *
 * Pure and isomorphic so it can be unit tested; the route does the async
 * hasTenantPermission() lookups.
 */
import { FEATURE_FLAG_KEYS } from '@/lib/business-types';
import { flattenSettingsForPrisma } from '@/lib/tenant-settings-flatten';

export const GENERAL_SETTINGS_PERMISSION = 'settings.manage';

/** Settings key → permissions, any one of which allows changing it. */
export const SETTINGS_SECTION_PERMISSIONS: Record<string, string[]> = {
  hardwareConfig: ['hardware.manage'],
  advancedBranding: ['branding.manage'],
  multiCurrency: ['multi_currency.manage'],
  // Edited on both the main Settings page and the Multi-Currency page.
  currency: [GENERAL_SETTINGS_PERMISSION, 'multi_currency.manage'],
  currencySymbol: [GENERAL_SETTINGS_PERMISSION, 'multi_currency.manage'],
  ...Object.fromEntries(FEATURE_FLAG_KEYS.map((key) => [key, ['feature_flags.manage']])),
};

export const permissionsForSettingsKey = (key: string): string[] =>
  SETTINGS_SECTION_PERMISSIONS[key] ?? [GENERAL_SETTINGS_PERMISSION];

function normalize(value: unknown): unknown {
  if (value === undefined || value === null) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') {
    // Prisma.Decimal (and similar) — compare numerically.
    const maybeDecimal = value as { toNumber?: () => number };
    if (typeof maybeDecimal.toNumber === 'function') return maybeDecimal.toNumber();
    return JSON.stringify(value);
  }
  return value;
}

/**
 * Whether persisting `{ [key]: value }` would change any stored column.
 * Keys that map to no column (unknown/derived keys such as
 * `suggestedCurrency`, or excluded sections such as `businessHours`) never
 * count as changed, since nothing would be written for them.
 */
export function settingsKeyChanges(key: string, value: unknown, existingRow: Record<string, unknown>): boolean {
  const columns = flattenSettingsForPrisma({ [key]: value });
  return Object.entries(columns).some(([column, next]) => normalize(next) !== normalize(existingRow[column]));
}

export interface SettingsPermissionRequirement {
  /** Keys whose stored value would change. */
  changedKeys: string[];
  /** One entry per changed key: the user needs at least one permission in each list. */
  required: string[][];
  /**
   * When nothing changes, the user still needs one of these (the union of the
   * submitted keys' permissions), so a no-op request isn't an open door.
   */
  anyOfWhenUnchanged: string[];
}

export function settingsPermissionRequirement(
  submitted: Record<string, unknown>,
  existingRow: Record<string, unknown>
): SettingsPermissionRequirement {
  const keys = Object.keys(submitted);
  const changedKeys = keys.filter((key) => settingsKeyChanges(key, submitted[key], existingRow));
  const anyOfWhenUnchanged = [...new Set(keys.flatMap(permissionsForSettingsKey))];
  return {
    changedKeys,
    required: changedKeys.map(permissionsForSettingsKey),
    anyOfWhenUnchanged: anyOfWhenUnchanged.length ? anyOfWhenUnchanged : [GENERAL_SETTINGS_PERMISSION],
  };
}
