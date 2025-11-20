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
  
  // Feature Flags
  enableInventory?: boolean;
  enableCategories?: boolean;
  enableDiscounts?: boolean;
  enableLoyaltyProgram?: boolean;
  enableCustomerManagement?: boolean;
  enableBookingScheduling?: boolean;
  
  // Hardware Configuration
  hardwareConfig?: {
    printer?: {
      type: 'browser' | 'usb' | 'serial' | 'network';
      ipAddress?: string;
      portNumber?: number;
    };
    barcodeScanner?: {
      type: 'keyboard';
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
}

export interface ITenant extends Document {
  slug: string;
  name: string;
  domain?: string;
  subdomain?: string;
  settings: ITenantSettings;
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
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// No explicit indexes needed - unique: true on slug, subdomain, and domain automatically creates indexes

const Tenant: Model<ITenant> = mongoose.models.Tenant || mongoose.model<ITenant>('Tenant', TenantSchema);

export default Tenant;

