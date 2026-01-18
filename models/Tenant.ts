import mongoose, { Schema, Document, Model } from 'mongoose';

export interface ITenantSettings {
  // Currency & Localization
  currency: string;
  currencySymbol?: string;
  currencyPosition: 'before' | 'after'; // e.g., $100 or 100$
  dateFormat: string; // e.g., 'MM/DD/YYYY', 'DD/MM/YYYY'
  timeFormat: '12h' | '24h';
  timezone: string;
  language: 'en' | 'es';
  numberFormat: {
    decimalSeparator: string; // '.' or ','
    thousandsSeparator: string; // ',' or '.'
    decimalPlaces: number; // 2 for currency
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
  taxLabel?: string; // e.g., "VAT", "GST", "Sales Tax"
  
  // Business Settings
  businessType?: string; // e.g., "Retail", "Restaurant", "Service"
  taxId?: string; // Tax ID or EIN
  registrationNumber?: string;
  
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
  enableMultiCurrency?: boolean;
  // Hardware Configuration
  hardwareConfig?: {
    printer?: {
      type: 'browser' | 'usb' | 'serial' | 'network';
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
    displayCurrencies?: string[]; // Array of currency codes to display
    exchangeRates?: Record<string, number>; // Exchange rates from base currency
    exchangeRateSource?: 'manual' | 'api'; // How rates are updated
    exchangeRateApiKey?: string; // API key for exchange rate service
    lastUpdated?: Date;
  };
  
  // Receipt Templates
  receiptTemplates?: {
    default?: string; // Template ID
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
      css?: string; // Custom CSS
      variables?: Record<string, string>; // CSS variables
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
    priority: number; // Higher priority rules apply first
    isActive: boolean;
  }>;
  
  // Business Hours
  businessHours?: {
    timezone?: string; // Override tenant timezone for hours
    schedule?: {
      [key: string]: { // 'monday', 'tuesday', etc.
        enabled: boolean;
        openTime?: string; // HH:MM format
        closeTime?: string; // HH:MM format
        breaks?: Array<{
          start: string; // HH:MM
          end: string; // HH:MM
        }>;
      };
    };
    specialHours?: Array<{
      date: string; // YYYY-MM-DD
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
    date: string; // YYYY-MM-DD or YYYY-MM-DD for recurring
    type: 'single' | 'recurring';
    recurring?: {
      pattern: 'yearly' | 'monthly' | 'weekly';
      dayOfMonth?: number;
      dayOfWeek?: number; // 0-6, Sunday = 0
      month?: number; // 1-12
    };
    isBusinessClosed: boolean; // If true, business is closed on this holiday
    createdAt?: Date;
  }>;
}

export interface ITenant extends Document {
  slug: string;
  name: string;
  domain?: string;
  subdomain?: string;
  settings: ITenantSettings;
  subscription: {
    plan: 'starter' | 'pro' | 'business' | 'enterprise';
    price: number;
    status: 'trial' | 'active' | 'expired' | 'cancelled';
    trialEndsAt?: Date;
    endsAt?: Date;
  };
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const TenantSchema: Schema = new Schema(
  {
    slug: {
      type: String,
      required: [true, 'Tenant slug is required'],
      unique: true,
      trim: true,
      lowercase: true,
      match: [/^[a-z0-9-]+$/, 'Slug can only contain lowercase letters, numbers, and hyphens'],
    },
    name: {
      type: String,
      required: [true, 'Tenant name is required'],
      trim: true,
    },
    domain: {
      type: String,
      trim: true,
      unique: true,
      sparse: true,
    },
    subdomain: {
      type: String,
      trim: true,
      lowercase: true,
      unique: true,
      sparse: true,
    },
    settings: {
      // Currency & Localization
      currency: {
        type: String,
        default: 'USD',
      },
      currencySymbol: String,
      currencyPosition: {
        type: String,
        enum: ['before', 'after'],
        default: 'before',
      },
      dateFormat: {
        type: String,
        default: 'MM/DD/YYYY',
      },
      timeFormat: {
        type: String,
        enum: ['12h', '24h'],
        default: '12h',
      },
      timezone: {
        type: String,
        default: 'UTC',
      },
      language: {
        type: String,
        enum: ['en', 'es'],
        default: 'en',
      },
      numberFormat: {
        decimalSeparator: {
          type: String,
          default: '.',
        },
        thousandsSeparator: {
          type: String,
          default: ',',
        },
        decimalPlaces: {
          type: Number,
          default: 2,
        },
      },
      
      // Branding
      companyName: String,
      logo: String,
      favicon: String,
      primaryColor: {
        type: String,
        default: '#2563eb', // blue-600
      },
      secondaryColor: String,
      accentColor: String,
      backgroundColor: String,
      textColor: String,
      
      // Contact Information
      email: String,
      phone: String,
      address: {
        street: String,
        city: String,
        state: String,
        zipCode: String,
        country: String,
      },
      website: String,
      
      // Receipt & Invoice Settings
      receiptHeader: String,
      receiptFooter: String,
      receiptShowLogo: {
        type: Boolean,
        default: true,
      },
      receiptShowAddress: {
        type: Boolean,
        default: true,
      },
      receiptShowPhone: {
        type: Boolean,
        default: false,
      },
      receiptShowEmail: {
        type: Boolean,
        default: false,
      },
      taxEnabled: {
        type: Boolean,
        default: false,
      },
      taxRate: {
        type: Number,
        default: 0,
        min: 0,
        max: 100,
      },
      taxLabel: {
        type: String,
        default: 'Tax',
      },
      
      // Business Settings
      businessType: String,
      taxId: String,
      registrationNumber: String,
      
      // Notification Settings
      lowStockThreshold: {
        type: Number,
        default: 10,
      },
      lowStockAlert: {
        type: Boolean,
        default: true,
      },
      emailNotifications: {
        type: Boolean,
        default: false,
      },
      smsNotifications: {
        type: Boolean,
        default: false,
      },
      attendanceNotifications: {
        enabled: {
          type: Boolean,
          default: true,
        },
        expectedStartTime: {
          type: String,
          default: '09:00', // HH:MM format
        },
        maxHoursWithoutClockOut: {
          type: Number,
          default: 12,
          min: 1,
          max: 24,
        },
      },
      
      // Feature Flags
      enableInventory: {
        type: Boolean,
        default: true,
      },
      enableCategories: {
        type: Boolean,
        default: true,
      },
      enableDiscounts: {
        type: Boolean,
        default: false,
      },
      enableLoyaltyProgram: {
        type: Boolean,
        default: false,
      },
      enableCustomerManagement: {
        type: Boolean,
        default: false,
      },
      enableBookingScheduling: {
        type: Boolean,
        default: false,
      },
      enableMultiCurrency: {
        type: Boolean,
        default: false,
      },
      
      // Hardware Configuration
      hardwareConfig: {
        printer: {
          type: {
            type: String,
            enum: ['browser', 'usb', 'serial', 'network'],
          },
          ipAddress: String,
          portNumber: Number,
        },
        barcodeScanner: {
          type: {
            type: String,
            enum: ['keyboard'],
          },
          enabled: Boolean,
        },
        qrReader: {
          enabled: Boolean,
          cameraId: String,
        },
        cashDrawer: {
          enabled: Boolean,
          connectedToPrinter: Boolean,
        },
        touchscreen: {
          enabled: Boolean,
        },
      },
      
      // Multi-Currency Support
      multiCurrency: {
        enabled: {
          type: Boolean,
          default: false,
        },
        displayCurrencies: [String],
        exchangeRates: {
          type: Map,
          of: Number,
        },
        exchangeRateSource: {
          type: String,
          enum: ['manual', 'api'],
          default: 'manual',
        },
        exchangeRateApiKey: String,
        lastUpdated: Date,
      },
      
      // Receipt Templates
      receiptTemplates: {
        default: String,
        templates: [{
          id: String,
          name: String,
          html: String,
          isDefault: Boolean,
          createdAt: Date,
          updatedAt: Date,
        }],
      },
      
      // Notification Templates
      notificationTemplates: {
        email: {
          bookingConfirmation: String,
          bookingReminder: String,
          bookingCancellation: String,
          lowStockAlert: String,
          attendanceAlert: String,
        },
        sms: {
          bookingConfirmation: String,
          bookingReminder: String,
          bookingCancellation: String,
          lowStockAlert: String,
        },
      },
      
      // Advanced Branding
      advancedBranding: {
        fontFamily: String,
        fontSource: {
          type: String,
          enum: ['google', 'custom', 'system'],
          default: 'system',
        },
        googleFontUrl: String,
        customFontUrl: String,
        theme: {
          type: String,
          enum: ['light', 'dark', 'auto', 'custom'],
          default: 'light',
        },
        customTheme: {
          css: String,
          variables: {
            type: Map,
            of: String,
          },
        },
        borderRadius: {
          type: String,
          enum: ['none', 'sm', 'md', 'lg', 'xl', 'custom'],
          default: 'md',
        },
        customBorderRadius: String,
      },
      
      // Regional Tax Rules
      taxRules: [{
        id: String,
        name: String,
        rate: {
          type: Number,
          min: 0,
          max: 100,
        },
        label: String,
        appliesTo: {
          type: String,
          enum: ['all', 'products', 'services', 'categories'],
          default: 'all',
        },
        categoryIds: [String],
        productIds: [String],
        region: {
          country: String,
          state: String,
          city: String,
          zipCodes: [String],
        },
        priority: {
          type: Number,
          default: 0,
        },
        isActive: {
          type: Boolean,
          default: true,
        },
      }],
      
      // Business Hours
      businessHours: {
        timezone: String,
        schedule: {
          type: Map,
          of: {
            enabled: Boolean,
            openTime: String,
            closeTime: String,
            breaks: [{
              start: String,
              end: String,
            }],
          },
        },
        specialHours: [{
          date: String,
          enabled: Boolean,
          openTime: String,
          closeTime: String,
          note: String,
        }],
      },
      
      // Holiday Calendar
      holidays: [{
        id: String,
        name: String,
        date: String,
        type: {
          type: String,
          enum: ['single', 'recurring'],
          default: 'single',
        },
        recurring: {
          pattern: {
            type: String,
            enum: ['yearly', 'monthly', 'weekly'],
          },
          dayOfMonth: Number,
          dayOfWeek: Number,
          month: Number,
        },
        isBusinessClosed: {
          type: Boolean,
          default: true,
        },
        createdAt: {
          type: Date,
          default: Date.now,
        },
      }],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    // Subscription object
    subscription: {
      plan: {
        type: String,
        enum: ['starter', 'pro', 'business', 'enterprise'],
        default: 'starter',
      },
      price: {
        type: Number,
        default: 999,
      },
      status: {
        type: String,
        enum: ['trial', 'active', 'expired', 'cancelled'],
        default: 'trial',
      },
      trialEndsAt: {
        type: Date,
      },
      endsAt: {
        type: Date,
      },
    },
  },
  {
    timestamps: true,
  }
);

// No explicit indexes needed - unique: true on slug, subdomain, and domain automatically creates indexes

const Tenant: Model<ITenant> = mongoose.models.Tenant || mongoose.model<ITenant>('Tenant', TenantSchema);

export default Tenant;

