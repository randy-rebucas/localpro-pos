/**
 * Pure TypeScript types for tenant settings.
 * This file must NOT import from mongoose or any server-only module
 * so it can be safely used in client components.
 */

export interface ITenantSettings {
  // Currency & Localization
  currency: string;
  currencySymbol?: string;
  currencyPosition: 'before' | 'after';
  dateFormat: string;
  timeFormat: '12h' | '24h';
  timezone: string;
  language: 'en' | 'es';
  numberFormat: {
    decimalSeparator: string;
    thousandsSeparator: string;
    decimalPlaces: number;
  };

  // Branding
  companyName?: string;
  logo?: string;
  favicon?: string;
  primaryColor?: string;
  secondaryColor?: string;
  accentColor?: string;
  backgroundColor?: string;
  textColor?: string;

  // Contact Information
  email?: string;
  phone?: string;
  address?: {
    street?: string;
    city?: string;
    state?: string;
    zipCode?: string;
    country?: string;
  };
  website?: string;

  // Receipt & Invoice Settings
  receiptHeader?: string;
  receiptFooter?: string;
  receiptShowLogo?: boolean;
  receiptShowAddress?: boolean;
  receiptShowPhone?: boolean;
  receiptShowEmail?: boolean;
  taxEnabled?: boolean;
  taxRate?: number;
  taxLabel?: string;

  // Business Settings
  businessType?: string;
  taxId?: string;
  registrationNumber?: string;

  // BIR Compliance Settings
  birTin?: string;
  birPtuNumber?: string;
  birPtuIssuedDate?: Date;
  birPtuExpiryDate?: Date;
  birMinNumber?: string;
  birBusinessStyle?: string;
  birSystemProvider?: string;

  // Notification Settings
  lowStockThreshold?: number;
  lowStockAlert?: boolean;
  emailNotifications?: boolean;
  smsNotifications?: boolean;
  attendanceNotifications?: {
    enabled?: boolean;
    expectedStartTime?: string;
    maxHoursWithoutClockOut?: number;
  };

  // Feature Flags
  enableInventory?: boolean;
  enableCategories?: boolean;
  enableDiscounts?: boolean;
  enableLoyaltyProgram?: boolean;
  enableCustomerManagement?: boolean;
  enableBookingScheduling?: boolean;
  enableTableManagement?: boolean;
  /** When true, POS may sell on account (customer balance / pay later). */
  enableOnAccountSales?: boolean;

  /**
   * Tenant-controlled integration layer (non-secret).
   * Enables which external storefronts may be connected for this tenant.
   */
  integrations?: {
    ecommerce?: {
      /** When true, staff may connect and use Shopify for this tenant. */
      shopifyEnabled?: boolean;
      /** When true, staff may connect and use WooCommerce for this tenant. */
      wooCommerceEnabled?: boolean;
    };
  };

  // Hardware Configuration
  hardwareConfig?: {
    printer?: {
      type: 'browser' | 'usb' | 'serial' | 'network';
      profile?: string;
      vendorId?: number;
      productId?: number;
      ipAddress?: string;
      portNumber?: number;
    };
    barcodeScanner?: {
      type: 'keyboard' | 'camera' | 'usb';
      enabled: boolean;
    };
    qrReader?: {
      enabled: boolean;
      cameraId?: string;
    };
    cashDrawer?: {
      enabled: boolean;
      connectedToPrinter: boolean;
    };
    touchscreen?: {
      enabled: boolean;
    };
  };

  // Multi-Currency Support
  multiCurrency?: {
    enabled: boolean;
    displayCurrencies?: string[];
    exchangeRates?: Record<string, number>;
    exchangeRateSource?: 'manual' | 'api';
    exchangeRateApiKey?: string;
    lastUpdated?: Date;
  };

  // Receipt Templates
  receiptTemplates?: {
    default?: string;
    templates?: Array<{
      id: string;
      name: string;
      html: string;
      isDefault?: boolean;
      createdAt?: Date;
      updatedAt?: Date;
    }>;
  };

  // Notification Templates
  notificationTemplates?: {
    email?: {
      bookingConfirmation?: string;
      bookingReminder?: string;
      bookingCancellation?: string;
      lowStockAlert?: string;
      attendanceAlert?: string;
    };
    sms?: {
      bookingConfirmation?: string;
      bookingReminder?: string;
      bookingCancellation?: string;
      lowStockAlert?: string;
    };
  };

  // Advanced Branding
  advancedBranding?: {
    fontFamily?: string;
    fontSource?: 'google' | 'custom' | 'system';
    googleFontUrl?: string;
    customFontUrl?: string;
    theme?: 'light' | 'dark' | 'auto' | 'custom';
    customTheme?: {
      css?: string;
      variables?: Record<string, string>;
    };
    borderRadius?: 'none' | 'sm' | 'md' | 'lg' | 'xl' | 'custom';
    customBorderRadius?: string;
  };

  // Regional Tax Rules
  taxRules?: Array<{
    id: string;
    name: string;
    rate: number;
    label: string;
    appliesTo?: 'all' | 'products' | 'services' | 'categories';
    categoryIds?: string[];
    productIds?: string[];
    region?: {
      country?: string;
      state?: string;
      city?: string;
      zipCodes?: string[];
    };
    priority: number;
    isActive: boolean;
  }>;

  // Business Hours
  businessHours?: {
    timezone?: string;
    schedule?: {
      [key: string]: {
        enabled: boolean;
        openTime?: string;
        closeTime?: string;
        breaks?: Array<{
          start: string;
          end: string;
        }>;
      };
    };
    specialHours?: Array<{
      date: string;
      enabled: boolean;
      openTime?: string;
      closeTime?: string;
      note?: string;
    }>;
  };

  // Business Permits — universal, applies to ALL business types (Philippine LGU)
  businessPermits?: {
    mayorsPermitNumber?: string;
    mayorsPermitExpiry?: Date;
    barangayClearanceNumber?: string;
    barangayClearanceExpiry?: Date;
    dtiSecRegistration?: string; // DTI for sole prop, SEC for corp/partnership
    birCertificateOfRegistration?: string; // BIR COR number
    fireSafetyInspectionCertificate?: string; // FSIC number
    fsicExpiry?: Date;
    sanitaryPermitNumber?: string; // shared by most business types
    sanitaryPermitExpiry?: Date;
  };

  // Restaurant / Food Service Compliance (RA 10611 Food Safety Act)
  restaurantCompliance?: {
    fdaFoodBusinessLicense?: string; // FDA FBL number
    fdaFblExpiry?: Date;
    foodSafetyCertificateNumber?: string; // FSC per establishment
    foodSafetyCertificateExpiry?: Date;
    foodHandlersCertified?: boolean; // all food handlers have health certificates
    numberOfCertifiedHandlers?: number;
    healthCertificateExpiry?: Date; // earliest expiry among food handlers
    kitchenSanitationCompliant?: boolean;
  };

  // Retail Store Compliance (RA 7394 Consumer Act)
  retailCompliance?: {
    dtiBusinessNameRegistration?: string; // DTI BN Registration No.
    priceTaggingCompliant?: boolean; // all items have visible price tags
    weightsAndMeasuresCompliant?: boolean; // calibrated scales / measuring devices
    btiAccreditation?: string; // Bureau of Trade & Industry accreditation (optional)
    productLabelsCompliant?: boolean; // RA 7394 label requirements
  };

  // Laundry Service Compliance (DENR/EMB wastewater)
  laundryCompliance?: {
    environmentalComplianceCertificate?: string; // ECC from DENR/EMB
    eccExpiry?: Date;
    wastewaterDischargePermit?: string; // Discharge Permit from DENR
    wastewaterPermitExpiry?: Date;
    solidWasteManagementPlan?: boolean; // RA 9003 compliance
  };

  // Service Business Compliance (salon, spa, repair — DOH/LGU)
  serviceCompliance?: {
    dohAccreditation?: string; // DOH accreditation for health-related services
    dohAccreditationExpiry?: Date;
    practitionerLicenses?: Array<{
      name: string;
      licenseType: string; // Beautician, Cosmetologist, Massage Therapist, etc.
      prcNumber?: string;
      ptrNumber?: string;
      licenseExpiry?: Date;
    }>;
  };

  // Pharmacy Compliance Settings (only relevant when businessType = 'pharmacy')
  pharmacyCompliance?: {
    pharmacistName?: string;
    pharmacistPRCNumber?: string; // Philippine PRC license number
    pharmacistPTRNumber?: string; // Professional Tax Receipt number
    fdaLTO?: string; // FDA License to Operate number
    fdaLTOExpiryDate?: Date;
    dohAccreditation?: string;
    pdeaLicense?: string; // Required for dangerous drugs
    pdeaLicenseExpiry?: Date;
    requirePrescriptionForRx?: boolean;
    trackExpiryDates?: boolean;
    expiryAlertDays?: number;
  };

  // Holiday Calendar
  holidays?: Array<{
    id: string;
    name: string;
    date: string;
    type: 'single' | 'recurring';
    recurring?: {
      pattern: 'yearly' | 'monthly' | 'weekly';
      dayOfMonth?: number;
      dayOfWeek?: number;
      month?: number;
    };
    isBusinessClosed: boolean;
    createdAt?: Date;
  }>;
}
