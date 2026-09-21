import { NextRequest, NextResponse } from 'next/server';
import prisma, { dbTransaction } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { hasTenantPermission } from '@/lib/permissions-server';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { getDefaultTenantSettings } from '@/lib/currency';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { applyBusinessTypeDefaults, omitFeatureFlagDefaults, FEATURE_FLAG_KEYS } from '@/lib/business-types';
import { checkRateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';
import { flattenSettingsForPrisma } from '@/lib/tenant-settings-flatten';
import { runWithBypass } from '@/lib/tenant-context';
import { suggestCurrencyForCountry } from '@/lib/country-currency';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    // Settings are public per tenant (no sensitive data exposed). This runs
    // before any per-tenant auth context exists (it's how the client first
    // discovers the tenant it's in), and TenantSettings is RLS-protected, so
    // the lookup must explicitly bypass RLS rather than relying on request
    // auth to have set `app.tenant_id` already — see lib/tenant-context.ts.
    const { slug } = await params;
    const t = await getValidationTranslatorFromRequest(request);

    // IMPORTANT: `prisma.tenant.findFirst({ include: { settings: true } })`
    // under runWithBypass() does NOT reliably propagate the RLS bypass to the
    // joined relation — only the top-level row (verified empirically: the
    // include comes back null even for a tenant with a real, populated
    // settings row). The batch-array form `withTenantScoping` uses on the
    // $extends()-wrapped client apparently doesn't keep that guarantee for
    // relation includes or for direct writes either. `dbTransaction` (a real
    // interactive `$transaction(async tx => ...)` on the un-extended client)
    // does not have this problem, so every RLS-bypassed op here goes through
    // it instead — including the plain reads, since `runWithBypass(() =>
    // prisma.tenantSettings.findUnique(...))` on its own was also observed
    // to silently return null instead of throwing.
    const { tenant, settings, override } = await runWithBypass(() =>
      dbTransaction(async (tx) => {
        const tenantRow = await tx.tenant.findFirst({ where: { slug, isActive: true } });
        if (!tenantRow) return { tenant: null, settings: null, override: null };
        const settingsRow = await tx.tenantSettings.findUnique({ where: { tenantId: tenantRow.id } });
        const overrideRow = await tx.tenantRolePermissionOverride.findUnique({ where: { tenantId: tenantRow.id } });
        return { tenant: tenantRow, settings: settingsRow, override: overrideRow };
      })
    );

    if (!tenant) {
      return NextResponse.json(
        { success: false, error: t('validation.tenantNotFound', 'Tenant not found') },
        { status: 404 }
      );
    }

    // Self-heal: every signup/tenant-creation path creates TenantSettings
    // atomically alongside the Tenant row, but a tenant migrated or seeded
    // outside those paths can end up with no settings row at all — which
    // otherwise surfaces as every field on the Settings page silently
    // reverting to blank/default, hiding data the owner already entered
    // during onboarding (e.g. the store name they typed at signup lives on
    // `Tenant.name`, not yet mirrored onto `TenantSettings.companyName`).
    let tenantSettings = settings;
    if (!tenantSettings) {
      const defaults = flattenSettingsForPrisma(
        applyBusinessTypeDefaults(
          omitFeatureFlagDefaults(getDefaultTenantSettings() as unknown as Record<string, unknown>),
          'general'
        ) as unknown as Record<string, unknown>
      );
      tenantSettings = await runWithBypass(() =>
        dbTransaction((tx) =>
          tx.tenantSettings.upsert({
            where: { tenantId: tenant.id },
            create: { tenantId: tenant.id, ...defaults, companyName: tenant.name },
            update: {},
          })
        )
      );
    }

    // Role-permission overrides live in a separate table (see lib/permissions-server.ts's
    // hasTenantPermission, the server-side source of truth). They're merged back in here
    // (read-only, no permission metadata) so the client's usePermissions()/canAccess() can
    // mirror the same effective overrides the server actually enforces, instead of always
    // falling back to each permission's hardcoded default role floor.
    const rolePermissionOverrides = (override?.overrides as Record<string, unknown> | undefined) || {};

    // This GET is intentionally unauthenticated (see the comment above — it's
    // how the client discovers which tenant it's in before login). The raw
    // exchangeRateApiKey is a real credential (see app/api/tenants/[slug]/
    // exchange-rates/route.ts, which sends it to an external rate provider),
    // so it must never be included here — only whether one is on file. The
    // admin UI re-derives its masked display from that flag; leaving the
    // field blank on save preserves the existing key instead of clearing it
    // (see the PUT handler below).
    const { exchangeRateApiKey, ...settingsWithoutApiKey } = tenantSettings as Record<string, unknown>;

    // Suggests a base currency from the tenant's configured address country
    // (Multi-Currency admin page) — a hint only, never auto-applied server-side.
    const currencySuggestion = suggestCurrencyForCountry(
      (settingsWithoutApiKey as { addressCountry?: string }).addressCountry
    );

    const data = {
      ...settingsWithoutApiKey,
      exchangeRateApiKeyConfigured: !!exchangeRateApiKey,
      suggestedCurrency: currencySuggestion,
      rolePermissionOverrides,
    };

    return NextResponse.json({
      success: true,
      data,
    });
  } catch (error: unknown) {
    logger.error('Error fetching tenant settings:', error);
    const t = await getValidationTranslatorFromRequest(request);
    const message = error instanceof Error ? error.message : undefined;
    return NextResponse.json({ success: false, error: message || t('validation.failedToFetchSettings', 'Failed to fetch settings') }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const t = await getValidationTranslatorFromRequest(request);

    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: t('validation.unauthorized', 'Unauthorized') }, { status: 401 });
    }

    const rl = checkRateLimit(`settings:${slug}`, 30, 60_000);
    if (!rl.allowed) {
      return NextResponse.json({ success: false, error: t('validation.tooManyRequests', 'Too many requests') }, { status: 429 });
    }

    if (!(await hasTenantPermission(user.role, user.tenantId, 'settings.manage'))) {
      return NextResponse.json({ success: false, error: t('validation.forbidden', 'Forbidden: Insufficient permissions') }, { status: 403 });
    }

    const body = await request.json();
    const settings = body.settings || body;

    // The GET handler never returns the raw exchangeRateApiKey (see above),
    // so the client always starts this field blank and only fills it in when
    // the admin types a *new* key. A blank/absent submission here must mean
    // "unchanged," not "clear the key" — otherwise every unrelated save from
    // the Multi-Currency page (toggling the source, editing display
    // currencies) would silently wipe out a previously-configured key.
    if (
      settings.multiCurrency &&
      typeof settings.multiCurrency === 'object' &&
      !settings.multiCurrency.exchangeRateApiKey
    ) {
      const { exchangeRateApiKey: _omit, ...multiCurrencyWithoutKey } = settings.multiCurrency;
      settings.multiCurrency = multiCurrencyWithoutKey;
    }

    // businessHours has its own granular permission (the Business Hours admin
    // page gates on it, not settings.manage) — enforce it here too, since this
    // shared settings endpoint is the only thing that actually persists
    // `businessHours.timezone` (schedule/specialHours are handled by the
    // dedicated business-hours route).
    if (Object.prototype.hasOwnProperty.call(settings, 'businessHours')
      && !(await hasTenantPermission(user.role, user.tenantId, 'business_hours.manage'))) {
      return NextResponse.json({ success: false, error: t('validation.forbidden', 'Forbidden: Insufficient permissions') }, { status: 403 });
    }

    // Validate settings structure
    const defaultSettings = getDefaultTenantSettings();

    // Load existing settings so sub-sections managed by dedicated admin pages
    // are preserved when the main settings page saves only its own tabs.
    // Queried separately rather than via `include: { settings: true } }` —
    // that pattern does not reliably return the joined RLS-protected relation
    // through this extended client (see the GET handler above for the
    // empirically-verified root cause); an empty `existingSettings` here
    // would silently reset every other tab's fields to their defaults the
    // next time a business-type switch persists the full merged object.
    const existingTenant = await prisma.tenant.findFirst({ where: { slug } });
    if (!existingTenant) {
      return NextResponse.json(
        { success: false, error: t('validation.tenantNotFound', 'Tenant not found') },
        { status: 404 }
      );
    }
    const existingSettingsRow = await prisma.tenantSettings.findUnique({ where: { tenantId: existingTenant.id } });
    const existingSettings = (existingSettingsRow as unknown as Record<string, unknown>) || {};

    // Tenant isolation: verify the authenticated user belongs to this tenant
    if (user.role !== 'super_admin' && user.tenantId !== existingTenant.id) {
      return NextResponse.json({ success: false, error: t('validation.forbidden', 'Forbidden') }, { status: 403 });
    }

    // Three-way merge: defaults → existing → incoming (incoming wins on conflict)
    const mergedSettings: Record<string, unknown> = { ...defaultSettings, ...existingSettings, ...settings };

    const currentBusinessType = existingSettings.businessType as string | undefined;
    const newBusinessType = settings.businessType;

    // Apply business type defaults if business type is being set or changed.
    // Feature flags the caller didn't explicitly send in this request are
    // reset (not just gap-filled) so switching business type actually
    // adopts that type's module set, instead of carrying over whatever the
    // previous business type had persisted (applyBusinessTypeDefaults only
    // fills nulls, and every flag is always persisted as a concrete boolean
    // post-creation, so without this reset a type switch would be a no-op
    // for every flag the request didn't explicitly touch).
    let updatedSettings = mergedSettings;
    if (newBusinessType && newBusinessType !== currentBusinessType) {
      const resetBase = { ...mergedSettings };
      for (const key of FEATURE_FLAG_KEYS) {
        if (!Object.prototype.hasOwnProperty.call(settings, key)) {
          delete resetBase[key];
        }
      }
      updatedSettings = applyBusinessTypeDefaults(resetBase, newBusinessType) as Record<string, unknown>;
    }

    // Validate currency code (basic check)
    if (updatedSettings.currency && (updatedSettings.currency as string).length !== 3) {
      return NextResponse.json(
        { success: false, error: t('validation.invalidCurrencyCode', 'Invalid currency code') },
        { status: 400 }
      );
    }

    // Validate tax rate
    if (updatedSettings.taxRate !== undefined) {
      const taxRate = updatedSettings.taxRate as number;
      if (taxRate < 0 || taxRate > 100) {
        return NextResponse.json(
          { success: false, error: t('validation.taxRateRange', 'Tax rate must be between 0 and 100') },
          { status: 400 }
        );
      }
    }

    // Validate color format (hex)
    const colorFields = ['primaryColor', 'secondaryColor', 'accentColor', 'backgroundColor', 'textColor'];
    for (const field of colorFields) {
      const value = updatedSettings[field] as string | undefined;
      if (value && !/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(value)) {
        const errorMsg = t('validation.invalidColorFormat', 'Invalid color format for {field}. Use hex format (e.g., #FF5733)').replace('{field}', field);
        return NextResponse.json({ success: false, error: errorMsg }, { status: 400 });
      }
    }

    // Validate logo URL scheme — the settings pages render this straight into
    // an <img src>, so only allow https to avoid javascript:/data: payloads
    // (matches the client-side check in the admin settings page).
    if (updatedSettings.logo && !/^https:\/\/[^\s"'<>]+$/i.test(updatedSettings.logo as string)) {
      return NextResponse.json(
        { success: false, error: t('validation.invalidLogoUrl', 'Logo URL must be a valid https:// address') },
        { status: 400 }
      );
    }

    // Validate font URL schemes — googleFontUrl/customFontUrl get rendered
    // into a <link href>/@font-face src: url(...) app-wide (see
    // contexts/TenantSettingsContext.tsx), same injection surface as `logo`
    // above, so the same https-only restriction applies. These live nested
    // under `advancedBranding` (see lib/tenant-settings-flatten.ts), unlike
    // `logo` which is a top-level scalar — checked pre-flatten here, so the
    // nesting still applies at this point in the handler.
    const advancedBranding = updatedSettings.advancedBranding as Record<string, unknown> | undefined;
    for (const field of ['googleFontUrl', 'customFontUrl']) {
      const value = advancedBranding?.[field] as string | undefined;
      if (value && !/^https:\/\/[^\s"'<>]+$/i.test(value)) {
        const errorMsg = t('validation.invalidFontUrl', 'Font URL must be a valid https:// address').replace('{field}', field);
        return NextResponse.json({ success: false, error: errorMsg }, { status: 400 });
      }
    }

    // Validate tax label / receipt text lengths (mirrors the client caps —
    // these get printed onto physical receipts via lib/hardware/receipt-printer.ts).
    if (updatedSettings.taxLabel && (updatedSettings.taxLabel as string).length > 32) {
      return NextResponse.json(
        { success: false, error: t('validation.taxLabelTooLong', 'Tax label must be 32 characters or fewer') },
        { status: 400 }
      );
    }
    for (const field of ['receiptHeader', 'receiptFooter']) {
      const value = updatedSettings[field] as string | undefined;
      if (value && value.length > 500) {
        return NextResponse.json(
          { success: false, error: t('validation.receiptTextTooLong', 'Receipt header/footer must be 500 characters or fewer') },
          { status: 400 }
        );
      }
    }

    // Validate low stock threshold bounds
    if (updatedSettings.lowStockThreshold !== undefined) {
      const threshold = updatedSettings.lowStockThreshold as number;
      if (threshold < 1 || threshold > 100000) {
        return NextResponse.json(
          { success: false, error: t('validation.lowStockThresholdRange', 'Low stock threshold must be between 1 and 100000') },
          { status: 400 }
        );
      }
    }

    // Only persist the settings keys this request actually owns (submitted
    // keys, plus any business-type-default fallout), so a concurrent PUT
    // touching other keys can't clobber this request's changes.
    const submittedKeys = Object.keys(settings);
    const scopedSettings: Record<string, unknown> = {};
    for (const key of submittedKeys) {
      if (key in updatedSettings) scopedSettings[key] = updatedSettings[key];
    }
    if (newBusinessType && newBusinessType !== currentBusinessType) {
      // Business-type default fallout should also be persisted alongside the
      // explicitly submitted keys.
      Object.assign(scopedSettings, updatedSettings);
    }

    const settingsUpdate = flattenSettingsForPrisma(scopedSettings);

    const updatedTenantSettings = await prisma.tenantSettings.upsert({
      where: { tenantId: existingTenant.id },
      create: { tenantId: existingTenant.id, ...settingsUpdate },
      update: settingsUpdate,
    });

    await createAuditLog(request, {
      tenantId: existingTenant.id,
      userId: user?.userId,
      action: AuditActions.UPDATE,
      entityType: 'tenant',
      entityId: existingTenant.id,
      changes: { settings: updatedSettings },
    });

    return NextResponse.json({ success: true, data: updatedTenantSettings });
  } catch (error: unknown) {
    logger.error('Error updating tenant settings:', error);
    const t = await getValidationTranslatorFromRequest(request);
    const message = error instanceof Error ? error.message : undefined;
    return NextResponse.json({ success: false, error: message || t('validation.failedToUpdateSettings', 'Failed to update settings') }, { status: 400 });
  }
}
