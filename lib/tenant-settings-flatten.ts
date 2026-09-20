/**
 * Maps the app-facing (nested, Mongoose-shaped) tenant settings object onto
 * the normalized, flat `TenantSettings` Prisma model's columns.
 *
 * The Mongoose `Tenant.settings` was a single Mixed sub-document, so callers
 * across the app (getDefaultTenantSettings(), the settings UI, signup) still
 * produce/consume that nested shape (e.g. `settings.address.city`,
 * `settings.numberFormat.decimalSeparator`). TenantSettings is now a
 * normalized table with fixed columns, so anything passed straight through
 * to `prisma.tenantSettings.create`/`update` must be flattened first, or
 * Prisma throws on the first key it doesn't recognize (e.g. `numberFormat`).
 *
 * Array-shaped sub-sections (businessHours schedule/specialHours, holidays,
 * receiptTemplates, practitionerLicenses, exchangeRates,
 * rolePermissionOverrides, taxRules) live in their own dedicated tables with
 * their own dedicated routes — this excludes them rather than attempting to
 * write them here, to avoid two different write paths racing on the same
 * normalized rows.
 *
 * Unknown/unmapped keys are silently dropped rather than thrown, since
 * arbitrary settings keys are no longer persistable on a fixed-column table.
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
// intentionally excluded here (see module doc above).
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
  'enableDelivery', 'enableWorkOrders', 'enableLaundryOrders', 'enableKitchenDisplay', 'enableAccounting',
  'enableSuppliers', 'enableExpenses', 'enableEmployees',
]);

export function flattenSettingsForPrisma(settings: Record<string, unknown>): Record<string, unknown> {
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
    // Unknown keys are dropped — see module doc above.
  }
  for (const column of Object.keys(flat)) {
    if (DATE_COLUMNS.has(column) && flat[column]) {
      flat[column] = new Date(flat[column] as string);
    }
  }
  return flat;
}
