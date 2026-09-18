import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { hasTenantPermission } from '@/lib/permissions-server';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { handleApiError } from '@/lib/error-handler';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { applyBusinessTypeDefaults } from '@/lib/business-types';

/**
 * NOTE ON TRANSLATION GAP:
 * The Mongoose `Tenant.settings` was a single Mixed sub-document, so the old
 * PUT handler could take an arbitrary `settings` object from the request body
 * and `$set` each top-level key directly (`settings.${key}`). In the Prisma
 * schema, TenantSettings is a fully normalized table with named columns
 * (some nested Mongoose paths were flattened, e.g. `settings.address.city`
 * -> `addressCity`, `settings.hardware.printerType` -> `printerType`, etc. —
 * see prisma/schema.prisma TenantSettings model comments). A byte-for-byte
 * dynamic key passthrough is not possible against a fixed relational schema.
 * This handler flattens the known nested legacy shapes (address, hardware,
 * notificationTemplates, customTheme) into their Prisma column names and
 * otherwise passes top-level keys straight through (the majority of settings
 * keys were kept as same-named scalar columns). Keys that don't correspond
 * to a TenantSettings column are ignored rather than thrown — callers that
 * relied on arbitrary/unknown settings keys being persisted need dedicated
 * follow-up once product confirms which of those keys are still needed.
 */
const NESTED_FLATTEN_MAP: Record<string, Record<string, string>> = {
  address: {
    street: 'addressStreet',
    city: 'addressCity',
    state: 'addressState',
    zipCode: 'addressZipCode',
    country: 'addressCountry',
  },
  hardware: {
    printerType: 'printerType',
    printerProfile: 'printerProfile',
    printerVendorId: 'printerVendorId',
    printerProductId: 'printerProductId',
    printerIpAddress: 'printerIpAddress',
    printerPortNumber: 'printerPortNumber',
    barcodeScannerType: 'barcodeScannerType',
    barcodeScannerEnabled: 'barcodeScannerEnabled',
    qrReaderEnabled: 'qrReaderEnabled',
    qrReaderCameraId: 'qrReaderCameraId',
    cashDrawerEnabled: 'cashDrawerEnabled',
    cashDrawerConnectedToPrinter: 'cashDrawerConnectedToPrinter',
    touchscreenEnabled: 'touchscreenEnabled',
  },
  notificationTemplates: {
    emailBookingConfirmation: 'emailBookingConfirmationTemplate',
    emailBookingReminder: 'emailBookingReminderTemplate',
    emailBookingCancellation: 'emailBookingCancellationTemplate',
    emailLowStockAlert: 'emailLowStockAlertTemplate',
    emailAttendanceAlert: 'emailAttendanceAlertTemplate',
    smsBookingConfirmation: 'smsBookingConfirmationTemplate',
    smsBookingReminder: 'smsBookingReminderTemplate',
    smsBookingCancellation: 'smsBookingCancellationTemplate',
    smsLowStockAlert: 'smsLowStockAlertTemplate',
  },
  customTheme: {
    fontFamily: 'fontFamily',
    fontSource: 'fontSource',
    googleFontUrl: 'googleFontUrl',
    customFontUrl: 'customFontUrl',
    theme: 'theme',
    customThemeCss: 'customThemeCss',
    borderRadius: 'borderRadius',
    customBorderRadius: 'customBorderRadius',
  },
  businessHours: {
    timezone: 'businessHoursTimezone',
  },
};

const KNOWN_SCALAR_KEYS = new Set([
  'currency', 'currencySymbol', 'currencyPosition', 'dateFormat', 'timeFormat', 'timezone', 'language',
  'decimalSeparator', 'thousandsSeparator', 'decimalPlaces', 'companyName', 'logo', 'favicon',
  'primaryColor', 'secondaryColor', 'accentColor', 'backgroundColor', 'textColor', 'email', 'phone',
  'website', 'receiptHeader', 'receiptFooter', 'receiptShowLogo', 'receiptShowAddress', 'receiptShowPhone',
  'receiptShowEmail', 'receiptDefaultTemplateId', 'taxEnabled', 'taxRate', 'taxLabel', 'businessType',
  'taxId', 'registrationNumber', 'lowStockThreshold', 'lowStockAlert', 'emailNotifications',
  'smsNotifications', 'attendanceNotificationsEnabled', 'attendanceExpectedStartTime',
  'attendanceMaxHoursWithoutClockOut', 'enableInventory', 'enableCategories', 'enableDiscounts',
  'enableLoyaltyProgram', 'enableCustomerManagement', 'enableOnAccountSales', 'autoOpenDrawerOnShiftStart',
  'autoOpenDrawerOnShiftEnd', 'enableBookingScheduling', 'enableTableManagement', 'ecommerceShopifyEnabled',
  'ecommerceWooCommerceEnabled', 'multiCurrencyEnabled', 'displayCurrencies', 'exchangeRateSource',
  'exchangeRateApiKey', 'exchangeRateLastUpdated',
]);

function flattenSettingsForPrisma(settings: Record<string, unknown>): Record<string, unknown> {
  const flat: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(settings)) {
    const nestedMap = NESTED_FLATTEN_MAP[key];
    if (nestedMap && value && typeof value === 'object' && !Array.isArray(value)) {
      for (const [nestedKey, nestedVal] of Object.entries(value as Record<string, unknown>)) {
        const column = nestedMap[nestedKey];
        if (column) flat[column] = nestedVal;
      }
      continue;
    }
    if (KNOWN_SCALAR_KEYS.has(key)) {
      flat[key] = value;
    }
    // Unknown keys are dropped — see NOTE above.
  }
  return flat;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const t = await getValidationTranslatorFromRequest(request);
    const tenant = await prisma.tenant.findFirst({ where: { slug }, include: { settings: true } });

    if (!tenant) {
      return NextResponse.json({ success: false, error: t('validation.tenantNotFound', 'Tenant not found') }, { status: 404 });
    }

    // Full tenant document (BIR/permit/registration numbers, contact info,
    // integration settings, etc.) is only for the tenant's own users or a
    // super_admin — everyone else (including unauthenticated callers, e.g.
    // the forbidden-access page identifying a tenant it was denied access to)
    // gets back only the minimal, non-sensitive identity fields.
    let user;
    try {
      user = await requireAuth(request);
    } catch {
      user = null;
    }
    const isSameTenantOrAdmin =
      !!user && (user.role === 'super_admin' || user.tenantId === tenant.id);

    if (isSameTenantOrAdmin) {
      return NextResponse.json({ success: true, data: tenant });
    }

    return NextResponse.json({
      success: true,
      data: { _id: tenant.id, slug: tenant.slug, name: tenant.name },
    });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const user = await requireAuth(request);
    const { slug } = await params;
    const t = await getValidationTranslatorFromRequest(request);

    const body = await request.json();
    const { name, domain, subdomain, isActive, settings } = body;

    const oldTenant = await prisma.tenant.findFirst({ where: { slug }, include: { settings: true } });
    if (!oldTenant) {
      return NextResponse.json({ success: false, error: t('validation.tenantNotFound', 'Tenant not found') }, { status: 404 });
    }

    if (user.role !== 'super_admin' && user.tenantId !== oldTenant.id) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    if (!(await hasTenantPermission(user.role, oldTenant.id, 'tenant_profile.manage'))) {
      return NextResponse.json({ success: false, error: 'Forbidden: Insufficient permissions' }, { status: 403 });
    }

    const updateData: Record<string, unknown> = {};

    if (name !== undefined) {
      if (!name.trim()) {
        return NextResponse.json(
          { success: false, error: t('validation.nameRequired', 'Name is required') },
          { status: 400 }
        );
      }
      updateData.name = name.trim();
    }

    if (domain !== undefined) {
      updateData.domain = domain.trim() || null;
    }

    if (subdomain !== undefined) {
      updateData.subdomain = subdomain.trim().toLowerCase() || null;
    }

    if (isActive !== undefined) {
      updateData.isActive = isActive;
    }

    let settingsUpdate: Record<string, unknown> | undefined;
    if (settings !== undefined) {
      // Check if business type is being changed
      const currentBusinessType = oldTenant.settings?.businessType ?? undefined;
      const newBusinessType = settings.businessType;

      let updatedSettings = settings;

      // Apply business type defaults if business type is being set or changed —
      // computed against a full merge (read-only, never written back wholesale)
      // so defaults resolve correctly, but only the resulting *changed* keys
      // are applied alongside the submitted ones.
      if (newBusinessType && newBusinessType !== currentBusinessType) {
        const mergedSettings = { ...(oldTenant.settings ?? {}), ...settings };
        const withDefaults = applyBusinessTypeDefaults(mergedSettings, newBusinessType);
        updatedSettings = withDefaults;
      }

      settingsUpdate = flattenSettingsForPrisma(updatedSettings);
    }

    const tenant = await prisma.$transaction(async (tx) => {
      const updated = await tx.tenant.update({
        where: { id: oldTenant.id },
        data: updateData,
      });

      if (settingsUpdate) {
        await tx.tenantSettings.upsert({
          where: { tenantId: oldTenant.id },
          create: { tenantId: oldTenant.id, ...settingsUpdate },
          update: settingsUpdate,
        });
      }

      return tx.tenant.findUnique({ where: { id: updated.id }, include: { settings: true } });
    });

    if (!tenant) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    // Track changes
    const changes: Record<string, any> = {}; // eslint-disable-line @typescript-eslint/no-explicit-any
    Object.keys(updateData).forEach(key => {
      if (oldTenant[key as keyof typeof oldTenant] !== updateData[key]) {
        changes[key] = {
          old: oldTenant[key as keyof typeof oldTenant],
          new: updateData[key],
        };
      }
    });
    if (settings) {
      changes.settings = { updated: true };
    }

    await createAuditLog(request, {
      tenantId: tenant.id,
      action: AuditActions.UPDATE,
      entityType: 'tenant',
      entityId: tenant.id,
      changes,
    });

    return NextResponse.json({ success: true, data: tenant });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    const t = await getValidationTranslatorFromRequest(request);
    if (error.code === 'P2002') {
      const field = error.meta?.target?.[0] || 'field';
      const errorMsg = t('validation.fieldAlreadyExists', '{field} already exists').replace('{field}', field);
      return NextResponse.json(
        { success: false, error: errorMsg },
        { status: 400 }
      );
    }
    if (error.message === 'Unauthorized' || error.message.includes('Forbidden')) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.message === 'Unauthorized' ? 401 : 403 }
      );
    }
    return handleApiError(error);
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const user = await requireAuth(request);
    const { slug } = await params;
    const t = await getValidationTranslatorFromRequest(request);

    const tenant = await prisma.tenant.findFirst({ where: { slug } });
    if (!tenant) {
      return NextResponse.json({ success: false, error: t('validation.tenantNotFound', 'Tenant not found') }, { status: 404 });
    }

    if (user.role !== 'super_admin' && user.tenantId !== tenant.id) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    if (!(await hasTenantPermission(user.role, tenant.id, 'tenant_profile.manage'))) {
      return NextResponse.json({ success: false, error: 'Forbidden: Insufficient permissions' }, { status: 403 });
    }

    // Soft delete - set isActive to false
    await prisma.tenant.update({ where: { id: tenant.id }, data: { isActive: false } });

    await createAuditLog(request, {
      tenantId: tenant.id,
      action: AuditActions.DELETE,
      entityType: 'tenant',
      entityId: tenant.id,
      changes: { slug: tenant.slug, name: tenant.name },
    });

    return NextResponse.json({ success: true, data: {} });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    if (error.message === 'Unauthorized' || error.message.includes('Forbidden')) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.message === 'Unauthorized' ? 401 : 403 }
      );
    }
    return handleApiError(error);
  }
}
