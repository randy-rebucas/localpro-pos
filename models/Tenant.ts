import mongoose, { Schema, Document, Model } from 'mongoose';
import { invalidateTenantCache } from '@/lib/db-cache';

// ITenantSettings lives in types/tenant.ts (no mongoose dependency) so it can
// be safely imported by client components. Re-export it here so all existing
// server-side imports from '@/models/Tenant' keep working unchanged.
export type { ITenantSettings } from '@/types/tenant';
import type { ITenantSettings } from '@/types/tenant';

export type OnboardingStatus = 'not_started' | 'in_progress' | 'complete';

export interface ITenant extends Document {
  slug: string;
  name: string;
  domain?: string;
  subdomain?: string;
  settings: ITenantSettings;
  isActive: boolean;
  onboardingStatus: OnboardingStatus;
  notes?: string;
  createdBy?: mongoose.Types.ObjectId;
  /** Non-resettable, all-time cumulative sales register (BIR Grand Total Accumulator). Never decremented, including on void/refund. */
  grandTotalSales?: number;
  /** Non-resettable, all-time completed-transaction counter, paired with grandTotalSales. */
  grandTotalTransactionCount?: number;
  /** Last time the suspicious-activity automation emailed this tenant (suppresses repeat alerts within a day). */
  suspiciousActivityAlertedAt?: Date;
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
    // Unique indexes for domain/subdomain are declared below with schema.index().
    domain: {
      type: String,
      trim: true,
      lowercase: true,
    },
    subdomain: {
      type: String,
      trim: true,
      lowercase: true,
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
        default: 'Asia/Manila',
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
        default: '#35979c', // 1Pos brand teal (see lib/brand-defaults.ts)
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

      // BIR Compliance Settings
      birTin: {
        type: String,
        trim: true,
        match: [/^\d{3}-\d{3}-\d{3}-\d{3}$/, 'BIR TIN must be in format NNN-NNN-NNN-NNN'],
      },
      birPtuNumber: { type: String, trim: true },
      birPtuIssuedDate: { type: Date },
      birPtuExpiryDate: { type: Date },
      birMinNumber: { type: String, trim: true },
      birBusinessStyle: { type: String, trim: true },
      birSystemProvider: { type: String, trim: true },
      birTerminalSN: { type: String, trim: true },
      birAccreditationNo: { type: String, trim: true },
      birAccreditationDate: { type: Date },
      birAccreditationValidUntil: { type: Date },
      birEsalesPushUrl: { type: String, trim: true }, // Optional endpoint to auto-POST daily/monthly sales summaries

      // Business Permits (all business types)
      businessPermits: {
        mayorsPermitNumber: { type: String, trim: true },
        mayorsPermitExpiry: { type: Date },
        barangayClearanceNumber: { type: String, trim: true },
        barangayClearanceExpiry: { type: Date },
        dtiSecRegistration: { type: String, trim: true },
        birCertificateOfRegistration: { type: String, trim: true },
        fireSafetyInspectionCertificate: { type: String, trim: true },
        fsicExpiry: { type: Date },
        sanitaryPermitNumber: { type: String, trim: true },
        sanitaryPermitExpiry: { type: Date },
      },

      // Retail Compliance (RA 7394 Consumer Act)
      retailCompliance: {
        dtiBusinessNameRegistration: { type: String, trim: true },
        priceTaggingCompliant: { type: Boolean, default: false },
        weightsAndMeasuresCompliant: { type: Boolean, default: false },
        btiAccreditation: { type: String, trim: true },
        productLabelsCompliant: { type: Boolean, default: false },
      },

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
      enableOnAccountSales: {
        type: Boolean,
        default: false,
      },
      autoOpenDrawerOnShiftStart: {
        type: Boolean,
        default: false,
      },
      autoOpenDrawerOnShiftEnd: {
        type: Boolean,
        default: false,
      },
      enableBookingScheduling: {
        type: Boolean,
        default: false,
      },

      integrations: {
        ecommerce: {
          shopifyEnabled: { type: Boolean, default: false },
          wooCommerceEnabled: { type: Boolean, default: false },
        },
      },
      
      // Hardware Configuration
      hardwareConfig: {
        printer: {
          type: {
            type: String,
            enum: ['browser', 'usb', 'serial', 'network'],
          },
          profile: String,
          vendorId: Number,
          productId: Number,
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

      // Per-role feature-permission overrides (viewer/cashier/manager only —
      // owner/admin/super_admin always have full access and are never overridable)
      rolePermissionOverrides: {
        type: Schema.Types.Mixed,
        default: {},
      },
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    onboardingStatus: {
      type: String,
      enum: ['not_started', 'in_progress', 'complete'],
      default: 'not_started',
    },
    notes: {
      type: String,
      trim: true,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    grandTotalSales: {
      type: Number,
      default: 0,
      min: 0,
    },
    grandTotalTransactionCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    // Automation marker: last suspicious-activity alert (at most one per day)
    suspiciousActivityAlertedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes. Tenants are read by _id, by slug (unique: true on the field) and by
// host (lib/tenant.ts getTenantFromHost: $or [{ subdomain }, { domain }]; each
// $or branch is served by one of the indexes below).
// Clearing a domain/subdomain stores null (app/api/tenants/[slug]/route.ts,
// app/api/super-admin/tenants/[slug]/route.ts). A sparse unique index still
// indexes explicit nulls, so a second tenant clearing its domain hit E11000.
// Partial indexes only enforce uniqueness for non-empty string values.
TenantSchema.index({ domain: 1 }, { unique: true, partialFilterExpression: { domain: { $gt: '' } } });
TenantSchema.index({ subdomain: 1 }, { unique: true, partialFilterExpression: { subdomain: { $gt: '' } } });

// Keep lib/db-cache.ts in sync with tenant writes made in this process. Pure
// grand-total counter bumps (one per sale) don't affect anything cached, so
// they're skipped to avoid wiping the cache on every transaction. Automation
// markers (not part of cached settings) are skipped for the same reason.
const COUNTER_ONLY_FIELDS = new Set(['grandTotalSales', 'grandTotalTransactionCount', 'suspiciousActivityAlertedAt', 'updatedAt']);

function isCounterOnlyUpdate(update: unknown): boolean {
  if (!update || typeof update !== 'object' || Array.isArray(update)) return false;
  return Object.entries(update as Record<string, unknown>).every(([op, fields]) => {
    if (op !== '$inc' && op !== '$set' && op !== '$setOnInsert') return false;
    return !!fields && typeof fields === 'object' && Object.keys(fields).every((f) => COUNTER_ONLY_FIELDS.has(f));
  });
}

TenantSchema.post(['updateOne', 'updateMany', 'findOneAndUpdate', 'replaceOne'], function () {
  if (isCounterOnlyUpdate(this.getUpdate())) return;
  invalidateTenantCache();
});
TenantSchema.post(['deleteOne', 'deleteMany', 'findOneAndDelete'], function () {
  invalidateTenantCache();
});
TenantSchema.post('save', function () {
  invalidateTenantCache();
});

const Tenant: Model<ITenant> = mongoose.models.Tenant || mongoose.model<ITenant>('Tenant', TenantSchema);

export default Tenant;

