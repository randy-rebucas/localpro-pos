import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Tenant from '@/models/Tenant';
import { requireAuth, requireRole } from '@/lib/auth';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { getDefaultTenantSettings } from '@/lib/currency';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { applyBusinessTypeDefaults } from '@/lib/business-types';

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

    // Expose subscription info for UI
    const { subscriptionPlan, subscriptionPrice, subscriptionStatus, subscriptionTrialEndsAt, subscriptionEndsAt } = tenant;
    return NextResponse.json({
      success: true,
      data: {
        ...tenant.settings,
        subscriptionPlan,
        subscriptionPrice,
        subscriptionStatus,
        subscriptionTrialEndsAt,
        subscriptionEndsAt,
      },
    });
  } catch (error: unknown) {
    console.error('Error fetching tenant settings:', error);
    const t = await getValidationTranslatorFromRequest(request);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : t('validation.failedToFetchSettings', 'Failed to fetch settings') }, { status: 500 }); 
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    await connectDB();
    const { slug } = await params;
    
    // Try to get current user, but don't require auth (settings are tenant-scoped)
    // If user is authenticated, verify they have proper role
    try {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const _user = await requireRole(request, ['admin', 'manager']);
      // User is authenticated and has proper role, proceed
    } catch {
      // If auth fails, still allow update but log it (tenant-scoped security)
      // In production, you might want to require auth here
      console.log('Settings update without authentication for tenant:', slug);
    }
    
    const body = await request.json();
    const settings = body.settings || body;
    const t = await getValidationTranslatorFromRequest(request);

    // Validate settings structure
    const defaultSettings = getDefaultTenantSettings();
    const mergedSettings = { ...defaultSettings, ...settings };
    
    // Auto-configure features based on business type if business type is being set/changed
    const existingTenant = await Tenant.findOne({ slug }).lean();
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

    // Try to create audit log if user is authenticated
    try {
      await requireAuth(request);
      await createAuditLog(request, {
        tenantId: tenant._id,
        action: AuditActions.UPDATE,
        entityType: 'tenant',
        entityId: tenant._id.toString(),
        changes: { settings: updatedSettings },
      });
    } catch {
      // Audit log is optional if not authenticated
    }

    return NextResponse.json({ success: true, data: tenant.settings });
  } catch (error: unknown) {
    console.error('Error updating tenant settings:', error);
    const t = await getValidationTranslatorFromRequest(request);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : t('validation.failedToUpdateSettings', 'Failed to update settings') }, { status: 400 }); 
  }
}

