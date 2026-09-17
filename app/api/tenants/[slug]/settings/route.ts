import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Tenant from '@/models/Tenant';
import { getCurrentUser } from '@/lib/auth';
import { hasTenantPermission } from '@/lib/permissions-server';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { getDefaultTenantSettings } from '@/lib/currency';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { applyBusinessTypeDefaults } from '@/lib/business-types';
import { checkRateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    await connectDB();
    // Settings are public per tenant (no sensitive data exposed)
    const { slug } = await params;
    const t = await getValidationTranslatorFromRequest(request);
    
    const tenant = await Tenant.findOne({ slug, isActive: true }).lean();
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
    await connectDB();
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
    // shared settings endpoint is the only thing that actually persists it.
    if (Object.prototype.hasOwnProperty.call(settings, 'businessHours')
      && !(await hasTenantPermission(user.role, user.tenantId, 'business_hours.manage'))) {
      return NextResponse.json({ success: false, error: t('validation.forbidden', 'Forbidden: Insufficient permissions') }, { status: 403 });
    }

    // Validate settings structure
    const defaultSettings = getDefaultTenantSettings();

    // Load existing settings so sub-sections managed by dedicated admin pages
    // (taxRules, businessHours, holidays, receiptTemplates, notificationTemplates,
    //  advancedBranding, hardwareConfig, birTin, etc.) are preserved when the
    // main settings page saves only its own tabs.
    const existingTenant = await Tenant.findOne({ slug }).lean();
    const existingSettings = existingTenant?.settings || {};

    // Three-way merge: defaults → existing → incoming (incoming wins on conflict)
    const mergedSettings = { ...defaultSettings, ...existingSettings, ...settings };

    const currentBusinessType = existingTenant?.settings?.businessType;
    const newBusinessType = settings.businessType;

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

    // Tenant isolation: verify the authenticated user belongs to this tenant (reuse existingTenant)
    if (existingTenant && user && user.role !== 'super_admin' && user.tenantId !== existingTenant._id.toString()) {
      return NextResponse.json({ success: false, error: t('validation.forbidden', 'Forbidden') }, { status: 403 });
    }

    // Only $set the settings keys this request actually owns (submitted keys, plus
    // any business-type-default keys it triggered) so a concurrent PUT touching
    // other keys (e.g. a different tab, or the page's language auto-save) can't
    // clobber this request's changes with its own stale read-merge snapshot.
    const keysToSet = Array.from(new Set([...Object.keys(settings), ...businessTypeDefaultKeys]));
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
      userId: user?.userId,
      action: AuditActions.UPDATE,
      entityType: 'tenant',
      entityId: tenant._id.toString(),
      changes: { settings: updatedSettings },
    });

    return NextResponse.json({ success: true, data: tenant.settings });
  } catch (error: unknown) {
    logger.error('Error updating tenant settings:', error);
    const t = await getValidationTranslatorFromRequest(request);
    const message = error instanceof Error ? error.message : undefined;
    return NextResponse.json({ success: false, error: message || t('validation.failedToUpdateSettings', 'Failed to update settings') }, { status: 400 });
  }
}

