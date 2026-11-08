import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Tenant from '@/models/Tenant';
import { getCurrentUser } from '@/lib/auth';
import { hasTenantPermission } from '@/lib/permissions-server';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { getDefaultTenantSettings } from '@/lib/currency';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { applyBusinessTypeDefaults, isBusinessTypeOpenForSignup } from '@/lib/business-types';
import { checkRateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';
import { getTenantBySlug } from '@/lib/tenant';
import { assertPublicHttpUrl, UnsafeOutboundUrlError } from '@/lib/net/outbound-url';
import { LOCKED_SETTINGS_KEYS, permissionForSettingsKey, stripSecretSettings } from '@/lib/tenant-settings-access';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    // Settings are readable per tenant (storefront, login, POS all need them),
    // but secrets are only returned to this tenant's settings managers.
    const { slug } = await params;
    const t = await getValidationTranslatorFromRequest(request);

    // Fetched by several providers/hooks per page — served from the cached slug
    // lookup (60s, invalidated on tenant writes) instead of a full document read
    const tenant = await getTenantBySlug(slug);
    if (!tenant) {
      return NextResponse.json(
        { success: false, error: t('validation.tenantNotFound', 'Tenant not found') },
        { status: 404 }
      );
    }

    const user = await getCurrentUser(request);
    const canSeeSecrets = !!user
      && (user.role === 'super_admin' || user.tenantId === tenant._id)
      && (await hasTenantPermission(user.role, user.tenantId, 'settings.manage'));

    if (canSeeSecrets) {
      return NextResponse.json(
        { success: true, data: tenant.settings },
        { headers: { 'Cache-Control': 'private, no-store' } }
      );
    }
    return NextResponse.json({ success: true, data: stripSecretSettings(tenant.settings) });
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
    await connectDB();
    const { slug } = await params;

    const t = await getValidationTranslatorFromRequest(request);

    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: t('validation.unauthorized', 'Unauthorized') }, { status: 401 });
    }

    // Per user, not per slug: this runs before the tenant check, so a per-slug
    // bucket let any signed-in user (of any tenant) exhaust another tenant's saves.
    const rl = checkRateLimit(`settings:${slug}:${user.userId}`, 30, 60_000);
    if (!rl.allowed) {
      return NextResponse.json({ success: false, error: t('validation.tooManyRequests', 'Too many requests') }, { status: 429 });
    }

    if (!(await hasTenantPermission(user.role, user.tenantId, 'settings.manage'))) {
      return NextResponse.json({ success: false, error: t('validation.forbidden', 'Forbidden: Insufficient permissions') }, { status: 403 });
    }

    const body = await request.json();
    const settings = body?.settings || body;
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
      return NextResponse.json({ success: false, error: t('validation.invalidRequest', 'Invalid request') }, { status: 400 });
    }

    // Validate settings structure
    const defaultSettings = getDefaultTenantSettings();

    // Load existing settings so sub-sections managed by dedicated admin pages
    // (taxRules, businessHours, holidays, receiptTemplates, notificationTemplates,
    //  advancedBranding, hardwareConfig, birTin, etc.) are preserved when the
    // main settings page saves only its own tabs.
    const existingTenant = await Tenant.findOne({ slug }).select('_id settings').lean();
    const existingSettings = existingTenant?.settings || {};

    // Tenant isolation: verify the authenticated user belongs to this tenant
    if (existingTenant && user.role !== 'super_admin' && user.tenantId !== existingTenant._id.toString()) {
      return NextResponse.json({ success: false, error: t('validation.forbidden', 'Forbidden') }, { status: 403 });
    }

    // The exchange-rate API key is stripped from non-manager reads, so a client
    // may send multiCurrency without it — treat "absent" as "keep the stored key"
    // instead of wiping it.
    const existingMultiCurrency = (existingSettings as Record<string, unknown>).multiCurrency as
      | { exchangeRateApiKey?: string }
      | undefined;
    if (
      settings.multiCurrency && typeof settings.multiCurrency === 'object'
      && settings.multiCurrency.exchangeRateApiKey === undefined
      && existingMultiCurrency?.exchangeRateApiKey
    ) {
      settings.multiCurrency = { ...settings.multiCurrency, exchangeRateApiKey: existingMultiCurrency.exchangeRateApiKey };
    }

    // Three-way merge: defaults → existing → incoming (incoming wins on conflict)
    const mergedSettings = { ...defaultSettings, ...existingSettings, ...settings };

    const currentBusinessType = existingTenant?.settings?.businessType;
    const newBusinessType = settings.businessType;

    // A tenant may stay on a closed type, but cannot move onto one
    if (newBusinessType && newBusinessType !== currentBusinessType && !isBusinessTypeOpenForSignup(newBusinessType)) {
      return NextResponse.json(
        { success: false, error: t('validation.businessTypeUnavailable', 'This business type is no longer available') },
        { status: 400 }
      );
    }

    // Apply business type defaults if business type is being set or changed
    let updatedSettings = mergedSettings;
    let businessTypeDefaultKeys: string[] = [];
    if (newBusinessType && newBusinessType !== currentBusinessType) {
      updatedSettings = applyBusinessTypeDefaults(mergedSettings, newBusinessType);
      businessTypeDefaultKeys = Object.keys(updatedSettings).filter(
        (key) => JSON.stringify(updatedSettings[key]) !== JSON.stringify(mergedSettings[key])
      );
    }

    // Validate currency code (basic check)
    if (updatedSettings.currency && updatedSettings.currency.length !== 3) {
      return NextResponse.json(
        { success: false, error: t('validation.invalidCurrencyCode', 'Invalid currency code') },
        { status: 400 }
      );
    }

    // Validate tax rate
    if (updatedSettings.taxRate !== undefined) {
      if (updatedSettings.taxRate < 0 || updatedSettings.taxRate > 100) {
        return NextResponse.json(
          { success: false, error: t('validation.taxRateRange', 'Tax rate must be between 0 and 100') },
          { status: 400 }
        );
      }
    }

    // Validate color format (hex)
    const colorFields = ['primaryColor', 'secondaryColor', 'accentColor', 'backgroundColor', 'textColor'];
    for (const field of colorFields) {
      if (updatedSettings[field] && !/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(updatedSettings[field])) {
        const errorMsg = t('validation.invalidColorFormat', 'Invalid color format for {field}. Use hex format (e.g., #FF5733)').replace('{field}', field);
        return NextResponse.json({ success: false, error: errorMsg }, { status: 400 });
      }
    }

    // Only $set the settings keys this request actually owns (submitted keys, plus
    // any business-type-default keys it triggered) so a concurrent PUT touching
    // other keys (e.g. a different tab, or the page's language auto-save) can't
    // clobber this request's changes with its own stale read-merge snapshot.
    // Clients send the whole settings object, so keys whose value is unchanged are
    // skipped — and the write (plus audit log) is skipped entirely if nothing changed.
    const existingRecord = existingSettings as Record<string, unknown>;
    const keysToSet = Array.from(new Set([...Object.keys(settings), ...businessTypeDefaultKeys])).filter(
      (key) => JSON.stringify(updatedSettings[key]) !== JSON.stringify(existingRecord[key])
    );
    if (existingTenant && keysToSet.length === 0) {
      return NextResponse.json({ success: true, data: existingTenant.settings });
    }

    // Keys owned by stricter admin pages must pass that page's permission here
    // too, or this endpoint is a way around it. Only keys the request actually
    // changes are checked (clients may echo unchanged keys back), and
    // business-type default keys are exempt — the server derives those itself.
    const submittedChanges = keysToSet.filter((key) => Object.prototype.hasOwnProperty.call(settings, key));
    const lockedKey = submittedChanges.find((key) => LOCKED_SETTINGS_KEYS.has(key));
    if (lockedKey) {
      return NextResponse.json(
        { success: false, error: t('validation.forbidden', 'Forbidden: Insufficient permissions') },
        { status: 403 }
      );
    }
    const requiredPermissions = Array.from(new Set(
      submittedChanges.map(permissionForSettingsKey).filter((p): p is string => !!p)
    ));
    for (const permission of requiredPermissions) {
      if (!(await hasTenantPermission(user.role, user.tenantId, permission))) {
        return NextResponse.json(
          { success: false, error: t('validation.forbidden', 'Forbidden: Insufficient permissions') },
          { status: 403 }
        );
      }
    }

    // The cron POSTs sales data to this URL from the server — reject internal
    // targets at save time (it is re-checked again on every push).
    const pushUrl = settings.birEsalesPushUrl;
    if (submittedChanges.includes('birEsalesPushUrl') && typeof pushUrl === 'string' && pushUrl.trim()) {
      try {
        await assertPublicHttpUrl(pushUrl.trim());
      } catch (err) {
        const reason = err instanceof UnsafeOutboundUrlError ? err.message : 'Invalid URL';
        return NextResponse.json(
          { success: false, error: `${t('validation.invalidPushUrl', 'Invalid eSales push endpoint')}: ${reason}` },
          { status: 400 }
        );
      }
    }

    const setPayload: Record<string, unknown> = {};
    for (const key of keysToSet) {
      setPayload[`settings.${key}`] = updatedSettings[key];
    }

    const tenant = await Tenant.findOneAndUpdate(
      { slug },
      { $set: setPayload },
      { new: true, runValidators: true }
    );

    if (!tenant) {
      return NextResponse.json(
        { success: false, error: t('validation.tenantNotFound', 'Tenant not found') },
        { status: 404 }
      );
    }

    await createAuditLog(request, {
      tenantId: tenant._id,
      userId: user.userId,
      action: AuditActions.UPDATE,
      entityType: 'tenant',
      entityId: tenant._id.toString(),
      // Only the changed keys (before → after), not the whole settings tree
      changes: {
        settings: Object.fromEntries(
          keysToSet.map((key) => [key, { from: existingRecord[key], to: updatedSettings[key] }])
        ),
      },
    });

    return NextResponse.json({ success: true, data: tenant.settings });
  } catch (error: unknown) {
    logger.error('Error updating tenant settings:', error);
    const t = await getValidationTranslatorFromRequest(request);
    const message = error instanceof Error ? error.message : undefined;
    return NextResponse.json({ success: false, error: message || t('validation.failedToUpdateSettings', 'Failed to update settings') }, { status: 400 });
  }
}

