import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Tenant from '@/models/Tenant';
import { requireRole, getCurrentUser } from '@/lib/auth';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { getDefaultTenantSettings } from '@/lib/currency';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { applyBusinessTypeDefaults } from '@/lib/business-types';
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

    await requireRole(request, ['admin', 'manager', 'owner', 'super_admin']);
    const user = await getCurrentUser(request);

    const body = await request.json();
    const settings = body.settings || body;
    const t = await getValidationTranslatorFromRequest(request);

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

    // Tenant isolation: verify the authenticated user belongs to this tenant
    const tenantCheck = await Tenant.findOne({ slug }).select('_id').lean();
    if (tenantCheck && user && user.role !== 'super_admin' && user.tenantId !== tenantCheck._id.toString()) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const tenant = await Tenant.findOneAndUpdate(
      { slug },
      { $set: { settings: updatedSettings } },
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

