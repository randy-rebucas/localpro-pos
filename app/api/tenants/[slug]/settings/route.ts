import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import { hasTenantPermission } from '@/lib/permissions-server';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { getDefaultTenantSettings } from '@/lib/currency';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { applyBusinessTypeDefaults } from '@/lib/business-types';
import { checkRateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';
import { getTenantBySlug, getTenantBySlugAny } from '@/lib/data/tenants';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    // Settings are public per tenant (no sensitive data exposed)
    const { slug } = await params;
    const t = await getValidationTranslatorFromRequest(request);

    const tenant = await getTenantBySlug(slug);
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

    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const rl = checkRateLimit(`settings:${slug}`, 30, 60_000);
    if (!rl.allowed) {
      return NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429 });
    }

    if (!(await hasTenantPermission(user.role, user.tenantId, 'settings.manage'))) {
      return NextResponse.json({ success: false, error: 'Forbidden: Insufficient permissions' }, { status: 403 });
    }

    const body = await request.json();
    const settings = body.settings || body;
    const t = await getValidationTranslatorFromRequest(request);

    // Validate settings structure
    const defaultSettings = getDefaultTenantSettings();

    // Load existing settings so sub-sections managed by dedicated admin pages
    // (taxRules, businessHours, holidays, receiptTemplates, notificationTemplates,
    //  advancedBranding, hardwareConfig, birTin, etc.) are preserved when the
    // main settings page saves only its own tabs.
    const existingTenant = await getTenantBySlugAny(slug);
    const existingSettings = (existingTenant?.settings as Record<string, any>) || {}; // eslint-disable-line @typescript-eslint/no-explicit-any

    // Three-way merge: defaults → existing → incoming (incoming wins on conflict)
    const mergedSettings = { ...defaultSettings, ...existingSettings, ...settings };

    const currentBusinessType = existingSettings?.businessType;
    const newBusinessType = settings.businessType;

    // Apply business type defaults if business type is being set or changed
    let updatedSettings = mergedSettings;
    if (newBusinessType && newBusinessType !== currentBusinessType) {
      updatedSettings = applyBusinessTypeDefaults(mergedSettings, newBusinessType);
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
        return NextResponse.json(
          { success: false, error: `Invalid color format for ${field}. Use hex format (e.g., #FF5733)` },
          { status: 400 }
        );
      }
    }

    if (!existingTenant) {
      return NextResponse.json(
        { success: false, error: t('validation.tenantNotFound', 'Tenant not found') },
        { status: 404 }
      );
    }

    // Tenant isolation: verify the authenticated user belongs to this tenant (reuse existingTenant)
    if (user.role !== 'super_admin' && user.tenantId !== existingTenant.id) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const tenant = await prisma.tenant.update({
      where: { id: existingTenant.id },
      data: { settings: updatedSettings },
    });

    await createAuditLog(request, {
      tenantId: tenant.id,
      userId: user?.userId,
      action: AuditActions.UPDATE,
      entityType: 'tenant',
      entityId: tenant.id,
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
