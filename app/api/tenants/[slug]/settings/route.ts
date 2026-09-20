import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { hasTenantPermission } from '@/lib/permissions-server';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { getDefaultTenantSettings } from '@/lib/currency';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { applyBusinessTypeDefaults, FEATURE_FLAG_KEYS } from '@/lib/business-types';
import { checkRateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';
import { flattenSettingsForPrisma } from '@/lib/tenant-settings-flatten';
import { runWithBypass } from '@/lib/tenant-context';

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

    const tenant = await runWithBypass(() =>
      prisma.tenant.findFirst({ where: { slug, isActive: true }, include: { settings: true } })
    );
    if (!tenant) {
      return NextResponse.json(
        { success: false, error: t('validation.tenantNotFound', 'Tenant not found') },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: tenant.settings });
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
    const existingTenant = await prisma.tenant.findFirst({ where: { slug }, include: { settings: true } });
    if (!existingTenant) {
      return NextResponse.json(
        { success: false, error: t('validation.tenantNotFound', 'Tenant not found') },
        { status: 404 }
      );
    }
    const existingSettings = (existingTenant.settings as unknown as Record<string, unknown>) || {};

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
