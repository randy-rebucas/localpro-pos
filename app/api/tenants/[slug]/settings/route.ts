import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { hasTenantPermission } from '@/lib/permissions-server';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { getDefaultTenantSettings } from '@/lib/currency';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { applyBusinessTypeDefaults } from '@/lib/business-types';
import { checkRateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';

/**
 * NOTE ON TRANSLATION GAP (same rationale as app/api/tenants/[slug]/route.ts):
 * The Mongoose `Tenant.settings` was a single Mixed sub-document, so this
 * endpoint used to `$set` arbitrary top-level keys directly. TenantSettings
 * is now a normalized table with fixed columns, and several array-shaped
 * sub-sections (businessHours schedule/specialHours, holidays,
 * receiptTemplates, practitionerLicenses, exchangeRates,
 * rolePermissionOverrides, taxRules) live in their own dedicated tables and
 * their own dedicated routes — this endpoint does not attempt to write them
 * even if present in the submitted `settings` object, to avoid two different
 * write paths racing on the same normalized rows.
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
  multiCurrency: {
    enabled: 'multiCurrencyEnabled',
    displayCurrencies: 'displayCurrencies',
    exchangeRateSource: 'exchangeRateSource',
    exchangeRateApiKey: 'exchangeRateApiKey',
  },
  businessPermits: {
    mayorsPermitNumber: 'mayorsPermitNumber',
    mayorsPermitExpiry: 'mayorsPermitExpiry',
    barangayClearanceNumber: 'barangayClearanceNumber',
    barangayClearanceExpiry: 'barangayClearanceExpiry',
    dtiSecRegistration: 'dtiSecRegistration',
    birCertificateOfRegistration: 'birCertificateOfRegistration',
    fireSafetyInspectionCertificate: 'fireSafetyInspectionCertificate',
    fsicExpiry: 'fsicExpiry',
    sanitaryPermitNumber: 'sanitaryPermitNumber',
    sanitaryPermitExpiry: 'sanitaryPermitExpiry',
  },
  restaurantCompliance: {
    fdaFoodBusinessLicense: 'fdaFoodBusinessLicense',
    fdaFblExpiry: 'fdaFblExpiry',
    foodSafetyCertificateNumber: 'foodSafetyCertificateNumber',
    foodSafetyCertificateExpiry: 'foodSafetyCertificateExpiry',
    foodHandlersCertified: 'foodHandlersCertified',
    numberOfCertifiedHandlers: 'numberOfCertifiedHandlers',
    healthCertificateExpiry: 'healthCertificateExpiry',
    kitchenSanitationCompliant: 'kitchenSanitationCompliant',
  },
  retailCompliance: {
    dtiBusinessNameRegistration: 'dtiBusinessNameRegistration',
    priceTaggingCompliant: 'priceTaggingCompliant',
    weightsAndMeasuresCompliant: 'weightsAndMeasuresCompliant',
    btiAccreditation: 'btiAccreditation',
    productLabelsCompliant: 'productLabelsCompliant',
  },
  laundryCompliance: {
    environmentalComplianceCertificate: 'environmentalComplianceCertificate',
    eccExpiry: 'eccExpiry',
    wastewaterDischargePermit: 'wastewaterDischargePermit',
    wastewaterPermitExpiry: 'wastewaterPermitExpiry',
    solidWasteManagementPlan: 'solidWasteManagementPlan',
  },
  serviceCompliance: {
    dohAccreditation: 'serviceDohAccreditation',
    dohAccreditationExpiry: 'serviceDohAccreditationExpiry',
  },
  pharmacyCompliance: {
    pharmacistName: 'pharmacistName',
    pharmacistPRCNumber: 'pharmacistPRCNumber',
    pharmacistPTRNumber: 'pharmacistPTRNumber',
    fdaLTO: 'fdaLTO',
    fdaLTOExpiryDate: 'fdaLTOExpiryDate',
    dohAccreditation: 'pharmacyDohAccreditation',
    pdeaLicense: 'pdeaLicense',
    pdeaLicenseExpiry: 'pdeaLicenseExpiry',
    requirePrescriptionForRx: 'requirePrescriptionForRx',
    trackExpiryDates: 'trackExpiryDates',
    expiryAlertDays: 'expiryAlertDays',
  },
};

const DATE_COLUMNS = new Set([
  'birPtuIssuedDate', 'birPtuExpiryDate', 'mayorsPermitExpiry', 'barangayClearanceExpiry',
  'fsicExpiry', 'sanitaryPermitExpiry', 'fdaFblExpiry', 'foodSafetyCertificateExpiry',
  'healthCertificateExpiry', 'eccExpiry', 'wastewaterPermitExpiry', 'serviceDohAccreditationExpiry',
  'fdaLTOExpiryDate', 'pdeaLicenseExpiry', 'exchangeRateLastUpdated',
]);

// Array-shaped sub-sections handled by their own dedicated routes/tables —
// intentionally excluded here (see NOTE above).
const EXCLUDED_TOP_LEVEL_KEYS = new Set([
  'businessHours', 'holidays', 'receiptTemplates', 'practitionerLicenses',
  'exchangeRates', 'rolePermissionOverrides', 'taxRules',
]);

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
  'ecommerceWooCommerceEnabled', 'birTin', 'birPtuNumber', 'birPtuIssuedDate', 'birPtuExpiryDate',
  'birMinNumber', 'birBusinessStyle', 'birSystemProvider', 'birTerminalSN', 'birAccreditationNo',
  'birAccreditationDate', 'birAccreditationValidUntil', 'birEsalesPushUrl',
]);

function flattenSettingsForPrisma(settings: Record<string, unknown>): Record<string, unknown> {
  const flat: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(settings)) {
    if (EXCLUDED_TOP_LEVEL_KEYS.has(key)) continue;
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
  for (const column of Object.keys(flat)) {
    if (DATE_COLUMNS.has(column) && flat[column]) {
      flat[column] = new Date(flat[column] as string);
    }
  }
  return flat;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    // Settings are public per tenant (no sensitive data exposed)
    const { slug } = await params;
    const t = await getValidationTranslatorFromRequest(request);

    const tenant = await prisma.tenant.findFirst({ where: { slug, isActive: true }, include: { settings: true } });
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

    // Apply business type defaults if business type is being set or changed
    let updatedSettings = mergedSettings;
    if (newBusinessType && newBusinessType !== currentBusinessType) {
      updatedSettings = applyBusinessTypeDefaults(mergedSettings, newBusinessType) as Record<string, unknown>;
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
