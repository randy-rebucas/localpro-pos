/**
 * Access rules for Tenant.settings, shared by the settings API route and the
 * tenant layout that seeds settings into every page.
 *
 * - Secret fields are stripped from anything that can reach an anonymous
 *   visitor (public GET, server-rendered layout seed).
 * - Some settings keys belong to dedicated admin pages with a stricter
 *   permission than `settings.manage`; the generic settings PUT must enforce
 *   that permission too, or it becomes a way around it.
 */

/** Keys that the generic settings PUT may never write (each has its own endpoint). */
export const LOCKED_SETTINGS_KEYS = new Set<string>([
  // Managed by /api/tenants/[slug]/role-permissions (roles_permissions.manage).
  // Writable here, any settings.manage holder could grant themselves anything.
  'rolePermissionOverrides',
]);

/** Settings keys gated by a permission stricter than (or separate from) settings.manage. */
const KEY_PERMISSIONS: Record<string, string> = {
  businessHours: 'business_hours.manage',
  taxRules: 'tax_rules.manage',
  receiptTemplates: 'receipt_templates.manage',
  integrations: 'integrations.manage',
  businessPermits: 'business_permits.manage',
  restaurantCompliance: 'restaurant_compliance.manage',
  retailCompliance: 'retail_compliance.manage',
  laundryCompliance: 'laundry_compliance.manage',
  serviceCompliance: 'service_compliance.manage',
  pharmacyCompliance: 'pharmacy_compliance.manage',
};

/** The extra permission needed to change `key`, or null when settings.manage suffices. */
export function permissionForSettingsKey(key: string): string | null {
  if (KEY_PERMISSIONS[key]) return KEY_PERMISSIONS[key];
  // birTin, birPtuNumber, birEsalesPushUrl, ... (same gate as /bir-settings)
  if (/^bir[A-Z]/.test(key)) return 'bir_compliance.manage';
  return null;
}

/**
 * Copy of `settings` without secrets. Never mutates the input (the cached
 * tenant object from getTenantBySlug is shared across requests).
 */
export function stripSecretSettings<T>(settings: T): T {
  if (!settings || typeof settings !== 'object') return settings;
  const copy = { ...(settings as Record<string, unknown>) };

  // Outbound endpoint the cron POSTs sales data to — not for public eyes.
  delete copy.birEsalesPushUrl;

  const multiCurrency = copy.multiCurrency;
  if (multiCurrency && typeof multiCurrency === 'object') {
    const mc = { ...(multiCurrency as Record<string, unknown>) };
    delete mc.exchangeRateApiKey;
    copy.multiCurrency = mc;
  }

  return copy as T;
}
