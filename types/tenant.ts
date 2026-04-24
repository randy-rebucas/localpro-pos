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
