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
  // Was keyed 'customTheme' — but no page ever sends a top-level `customTheme`
  // object; the Advanced Branding page (and ITenantSettings) nest these under
  // `advancedBranding`, so every field here was silently dropped by the
  // "unknown keys are dropped" fallback below on every save. Renamed to match
  // what's actually sent; see docs/qa/advanced-branding-qa-analysis.md.
  advancedBranding: {
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

type HardwareConfigInput = {
  printer?: { type?: string; profile?: string; vendorId?: number; productId?: number; ipAddress?: string; portNumber?: number };
  barcodeScanner?: { type?: string; enabled?: boolean };
  qrReader?: { enabled?: boolean; cameraId?: string };
  cashDrawer?: { enabled?: boolean; connectedToPrinter?: boolean };
  touchscreen?: { enabled?: boolean };
};

const toIntOrNull = (v: unknown): number | null => {
  const n = typeof v === 'string' ? parseInt(v, 10) : (v as number);
  return Number.isInteger(n) ? n : null;
};

/**
 * Maps the client's nested `hardwareConfig` (ITenantSettings['hardwareConfig'],
 * sent by the admin Hardware page) onto the flat printer/scanner/drawer
 * columns. Each sub-object that is present is written in full (missing fields
 * → null) so clearing e.g. the printer IP actually clears the column; absent
 * sub-objects leave their columns untouched. `cashDrawer.direct` is per-device
 * pairing state and has no column — it stays in the browser's localStorage.
 */
export function flattenHardwareConfig(hc: HardwareConfigInput): Record<string, unknown> {
  const flat: Record<string, unknown> = {};
  if (hc.printer) {
    flat.printerType = hc.printer.type ?? null;
    flat.printerProfile = hc.printer.profile ?? null;
    flat.printerVendorId = toIntOrNull(hc.printer.vendorId);
    flat.printerProductId = toIntOrNull(hc.printer.productId);
    flat.printerIpAddress = hc.printer.ipAddress || null;
    flat.printerPortNumber = toIntOrNull(hc.printer.portNumber);
  }
  if (hc.barcodeScanner) {
    flat.barcodeScannerType = hc.barcodeScanner.type ?? null;
    flat.barcodeScannerEnabled = hc.barcodeScanner.enabled ?? null;
  }
  if (hc.qrReader) {
    flat.qrReaderEnabled = hc.qrReader.enabled ?? null;
    flat.qrReaderCameraId = hc.qrReader.cameraId || null;
  }
  if (hc.cashDrawer) {
    flat.cashDrawerEnabled = hc.cashDrawer.enabled ?? null;
    flat.cashDrawerConnectedToPrinter = hc.cashDrawer.connectedToPrinter ?? null;
  }
  if (hc.touchscreen) {
    flat.touchscreenEnabled = hc.touchscreen.enabled ?? null;
  }
  return flat;
}

export function flattenSettingsForPrisma(settings: Record<string, unknown>): Record<string, unknown> {
  const flat: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(settings)) {
    if (EXCLUDED_TOP_LEVEL_KEYS.has(key)) continue;
    if (key === 'hardwareConfig') {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        Object.assign(flat, flattenHardwareConfig(value as HardwareConfigInput));
      }
      continue;
    }
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

/**
 * Reverse of the `advancedBranding` mapping above: GET /api/tenants/[slug]/
 * settings returns the flat columns directly, so this nests them back under
 * `advancedBranding` the way ITenantSettings and every consumer expects.
 * Deliberately centralized here (not duplicated per-consumer) — the previous
 * duplication is exactly how this field went silently unread/unwritten
 * everywhere for a while (see docs/qa/advanced-branding-qa-analysis.md): the
 * flatten map above got out of sync with what the client actually sent, and
 * nothing forced the read side to agree with the write side.
 *
 * Used by both hooks/useBrandingSettings.ts (the admin config page) and
 * contexts/TenantSettingsContext.tsx (the app-wide provider that actually
 * applies the configured font/custom CSS to every tenant page).
 */
export function reshapeAdvancedBranding(data: Record<string, unknown>): Record<string, unknown> {
  if (data.advancedBranding) return data;
  const {
    fontFamily, fontSource, googleFontUrl, customFontUrl, theme,
    customThemeCss, borderRadius, customBorderRadius,
    ...rest
  } = data;
  return {
    ...rest,
    advancedBranding: {
      fontFamily: fontFamily ?? undefined,
      fontSource: fontSource ?? 'system',
      googleFontUrl: googleFontUrl ?? undefined,
      customFontUrl: customFontUrl ?? undefined,
      theme: theme ?? 'light',
      customThemeCss: customThemeCss ?? undefined,
      borderRadius: borderRadius ?? 'md',
      customBorderRadius: customBorderRadius ?? undefined,
    },
  };
}

/**
 * Reverse of flattenHardwareConfig(): nests the flat printer/scanner/drawer
 * columns back under `hardwareConfig` (the ITenantSettings shape every
 * consumer reads — the admin Hardware page, TenantSettingsContext, and
 * /api/hardware/cash-drawer-kick). Applied server-side in GET
 * /api/tenants/[slug]/settings and lib/tenant.ts getTenantSettingsById.
 * Sub-objects with no stored values are omitted.
 */
export function reshapeHardwareConfig(data: Record<string, unknown>): Record<string, unknown> {
  if (data.hardwareConfig) return data;
  const {
    printerType, printerProfile, printerVendorId, printerProductId, printerIpAddress, printerPortNumber,
    barcodeScannerType, barcodeScannerEnabled, qrReaderEnabled, qrReaderCameraId,
    cashDrawerEnabled, cashDrawerConnectedToPrinter, touchscreenEnabled,
    ...rest
  } = data;
  const defined = (o: Record<string, unknown>) =>
    Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null && v !== undefined));

  const hardwareConfig: Record<string, unknown> = {};
  if (printerType) {
    hardwareConfig.printer = defined({
      type: printerType, profile: printerProfile, vendorId: printerVendorId, productId: printerProductId,
      ipAddress: printerIpAddress, portNumber: printerPortNumber,
    });
  }
  if (barcodeScannerEnabled != null || barcodeScannerType) {
    hardwareConfig.barcodeScanner = { type: barcodeScannerType || 'keyboard', enabled: !!barcodeScannerEnabled };
  }
  if (qrReaderEnabled != null || qrReaderCameraId) {
    hardwareConfig.qrReader = defined({ enabled: !!qrReaderEnabled, cameraId: qrReaderCameraId });
  }
  if (cashDrawerEnabled != null || cashDrawerConnectedToPrinter != null) {
    hardwareConfig.cashDrawer = { enabled: !!cashDrawerEnabled, connectedToPrinter: !!cashDrawerConnectedToPrinter };
  }
  if (touchscreenEnabled != null) {
    hardwareConfig.touchscreen = { enabled: !!touchscreenEnabled };
  }
  return { ...rest, hardwareConfig };
}
