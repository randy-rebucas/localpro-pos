#!/usr/bin/env tsx
/**
 * 1POS — MongoDB -> PostgreSQL catch-up sync
 *
 * One-time post-migration sync: re-reads every legacy Mongoose collection and
 * upserts rows into Prisma/Postgres (see prisma/schema.prisma), catching both
 * documents created in Mongo after the original cutover (66bbcb8) and
 * documents whose fields changed after cutover. Postgres ids are the original
 * Mongo ObjectId hex strings, so matching is a direct `id` upsert — no id map
 * needed. This is a derivative of the deleted scripts/migrate-to-postgres.ts
 * (recovered via `git show 66bbcb8^:scripts/migrate-to-postgres.ts`), with
 * every `createMany({ skipDuplicates: true })` write transparently converted
 * to a per-row upsert by the `prisma` proxy defined below, so it also catches
 * updates instead of only inserting brand-new rows.
 *
 * Uses the legacy Mongoose models/connection copied into
 * scripts/_mongo-legacy/ (the real models/ and lib/mongodb.ts were deleted
 * when the migration completed) and the `mongodb` MONGODB_URI in .env.local,
 * which is still live.
 *
 * Usage:
 *   npx tsx scripts/sync-mongo-updates.ts [options]
 *
 * Options:
 *   --dry-run        Read Mongo only, print counts per target table, write nothing.
 *   --only=<model>   Run a single collection's sync in isolation (Mongoose
 *                     model name, case-insensitive, e.g. --only=Product).
 *
 * Exit codes:
 *   0  All entity groups synced without failure (or dry-run completed)
 *   1  One or more entity groups failed (see failure report at the end)
 */

import '../lib/script-runtime';

import dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(process.cwd(), '.env.local') });
dotenv.config({ path: resolve(process.cwd(), '.env') });

import mongoose from 'mongoose';
import connectDB from './_mongo-legacy/mongodb';
import prismaClient from '../lib/db';

// ── Upsert proxy ─────────────────────────────────────────────────────────
// Every entity-group function below calls `prisma.<model>.createMany({
// skipDuplicates: true, data: [...] })`, unchanged from the original
// insert-only migration script. Wrapping the client so `createMany` performs
// a per-row upsert (keyed on `id`, the Mongo ObjectId hex string) instead
// lets this sync also pick up documents whose fields changed after cutover,
// without touching any of the ~40 field-mapping call sites below.
let upsertCount = 0;
let insertCount = 0;
function makeUpsertingPrisma(client: typeof prismaClient) {
  return new Proxy(client, {
    get(target, prop: string) {
      const delegate = (target as unknown as Record<string, unknown>)[prop];
      if (!delegate || typeof delegate !== 'object') return delegate;
      return new Proxy(delegate, {
        get(delegateTarget, method: string) {
          if (method !== 'createMany') {
            return (delegateTarget as Record<string, unknown>)[method];
          }
          return async ({ data }: { data: Array<Record<string, unknown>> }) => {
            for (const row of data) {
              // Most models use `id` (the Mongo ObjectId hex string) as PK.
              // A few 1:1 "detail" tables (TenantSettings, ProductRestaurantDetails,
              // ProductLaundryDetails, ProductServiceDetails, ProductPharmacyDetails)
              // have no `id` column at all — their @id is tenantId/productId instead.
              const keyField =
                row.id !== undefined ? 'id' : row.tenantId !== undefined ? 'tenantId' : 'productId';
              const keyValue = row[keyField];
              const { [keyField]: _unused, ...rest } = row;
              const existing = await (
                delegateTarget as { findUnique: (args: unknown) => Promise<unknown> }
              ).findUnique({ where: { [keyField]: keyValue } });
              if (existing) {
                upsertCount++;
              } else {
                insertCount++;
              }
              await (
                delegateTarget as {
                  upsert: (args: unknown) => Promise<unknown>;
                }
              ).upsert({ where: { [keyField]: keyValue }, create: row, update: rest });
            }
            return { count: data.length };
          };
        },
      });
    },
  });
}
const prisma = makeUpsertingPrisma(prismaClient);

// ── Models ───────────────────────────────────────────────────────────────
import Tenant from './_mongo-legacy/models/Tenant';
import SubscriptionPlan from './_mongo-legacy/models/SubscriptionPlan';
import Coupon from './_mongo-legacy/models/Coupon';
import Branch from './_mongo-legacy/models/Branch';
import User from './_mongo-legacy/models/User';
import Address from './_mongo-legacy/models/Address';
import Device from './_mongo-legacy/models/Device';
import Category from './_mongo-legacy/models/Category';
import Product from './_mongo-legacy/models/Product';
import ProductBundle from './_mongo-legacy/models/ProductBundle';
import ProductChannelListing from './_mongo-legacy/models/ProductChannelListing';
import TenantEcommerceIntegration from './_mongo-legacy/models/TenantEcommerceIntegration';
import Customer from './_mongo-legacy/models/Customer';
import CustomerOTP from './_mongo-legacy/models/CustomerOTP';
import CustomerBalancePayment from './_mongo-legacy/models/CustomerBalancePayment';
import Campaign from './_mongo-legacy/models/Campaign';
import Subscription from './_mongo-legacy/models/Subscription';
import FeatureFlagOverride from './_mongo-legacy/models/FeatureFlagOverride';
import CashDrawerSession from './_mongo-legacy/models/CashDrawerSession';
import Discount from './_mongo-legacy/models/Discount';
import Expense from './_mongo-legacy/models/Expense';
import FileModel from './_mongo-legacy/models/File';
import Invoice from './_mongo-legacy/models/Invoice';
import LoyaltyConfig from './_mongo-legacy/models/LoyaltyConfig';
import LoyaltyTransaction from './_mongo-legacy/models/LoyaltyTransaction';
import OfflineTransaction from './_mongo-legacy/models/OfflineTransaction';
import Payment from './_mongo-legacy/models/Payment';
import Prescription from './_mongo-legacy/models/Prescription';
import RecurringBookingTemplate from './_mongo-legacy/models/RecurringBookingTemplate';
import SavedCart from './_mongo-legacy/models/SavedCart';
import StockMovement from './_mongo-legacy/models/StockMovement';
import TaxRule from './_mongo-legacy/models/TaxRule';
import PosTable from './_mongo-legacy/models/Table';
import ZReading from './_mongo-legacy/models/ZReading';
import Attendance from './_mongo-legacy/models/Attendance';
import Booking from './_mongo-legacy/models/Booking';
import Transaction from './_mongo-legacy/models/Transaction';
import AuditLog from './_mongo-legacy/models/AuditLog';
import ArchivedAuditLog from './_mongo-legacy/models/ArchivedAuditLog';
import SuperAdminAction from './_mongo-legacy/models/SuperAdminAction';
import BillingEvent from './_mongo-legacy/models/BillingEvent';

// ── CLI args ─────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const ONLY = (() => {
  const entry = args.find(a => a.startsWith('--only='));
  return entry ? entry.split('=').slice(1).join('=').toLowerCase() : null;
})();

const BATCH_SIZE = 500;
const INT4_MAX = 2147483647;

// ── Logging helpers ─────────────────────────────────────────────────────
const log = (msg: string) => console.log(msg);
const section = (msg: string) => console.log(`\n=== ${msg} ===`);

/**
 * Clamp a stock-like integer to Postgres INT4 range. Source data has a small
 * number of pharmacy products with obviously-corrupt stock counts (10 billion
 * to 100 quadrillion — a data-entry/import bug in the source app, not a real
 * inventory level). Clamping to INT4_MAX keeps the value unmistakably wrong
 * (still ~2.1 billion units) rather than crashing the migration or silently
 * losing precision via a schema type change; the tenant corrects the real
 * count afterward via the existing product-edit UI.
 */
function clampInt32(v: number | null | undefined, label: string, id: string): number {
  const n = v ?? 0;
  if (n > INT4_MAX || n < -INT4_MAX) {
    log(`  WARN: ${label} ${id} has out-of-range value ${n}, clamped to ${INT4_MAX}`);
    return INT4_MAX;
  }
  return n;
}

type Failure = { entity: string; error: string };
const failures: Failure[] = [];

// ── Generic helpers ──────────────────────────────────────────────────────

/** Mongo ObjectId (or any ref value) -> hex string, or null. */
function oid(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (v instanceof mongoose.Types.ObjectId) return v.toString();
  if (typeof v === 'string') return v;
  // Populated document or object with an _id
  if (typeof v === 'object' && v !== null && '_id' in (v as Record<string, unknown>)) {
    return String((v as { _id: unknown })._id);
  }
  return String(v);
}

/** Required version of oid() — throws if missing, for non-nullable FKs. */
function oidRequired(v: unknown, field: string): string {
  const s = oid(v);
  if (!s) throw new Error(`Missing required id/ref for field "${field}"`);
  return s;
}

/** Recursively convert ObjectIds/Dates inside a Mixed/JSON blob into JSON-safe values. */
function toJsonSafe(v: unknown): unknown {
  if (v === null || v === undefined) return v;
  if (v instanceof mongoose.Types.ObjectId) return v.toString();
  if (v instanceof Date) return v.toISOString();
  if (Array.isArray(v)) return v.map(toJsonSafe);
  if (typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      out[k] = toJsonSafe(val);
    }
    return out;
  }
  return v;
}

/** Mongo enum values that use a hyphen map to Prisma enum member names with underscores (@map in schema.prisma). */
function mapEnumValue<T extends string>(v: T | null | undefined, table: Record<string, string>): any { // eslint-disable-line @typescript-eslint/no-explicit-any
  if (v === null || v === undefined) return v;
  return table[v] ?? v;
}

const TABLE_STATUS_MAP: Record<string, string> = { 'check-requested': 'check_requested' };
const BOOKING_STATUS_MAP: Record<string, string> = { 'no-show': 'no_show' };
const ORDER_TYPE_MAP: Record<string, string> = { 'dine-in': 'dine_in' };

/** Convert a Mongoose Map (or plain object fallback) to a plain object. */
function mapToObject<T = unknown>(m: unknown): Record<string, T> {
  if (!m) return {};
  if (m instanceof Map) return Object.fromEntries(m.entries());
  if (typeof m === 'object') return m as Record<string, T>;
  return {};
}

async function batchCreate<T>(
  label: string,
  rows: T[],
  createMany: (batch: T[]) => Promise<unknown>
): Promise<void> {
  if (rows.length === 0) {
    log(`  ${label}: 0 rows (nothing to migrate)`);
    return;
  }
  if (DRY_RUN) {
    log(`  ${label}: ${rows.length} row(s) [dry-run, not written]`);
    return;
  }
  let migrated = 0;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    await createMany(batch);
    migrated += batch.length;
    log(`  ${label}: ${migrated}/${rows.length}`);
  }
}

/** Wrap an entity-group migration step so one failure doesn't abort the run. */
async function runStep(name: string, fn: () => Promise<void>): Promise<void> {
  if (ONLY && ONLY !== name.toLowerCase()) return;
  section(name);
  try {
    await fn();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`  FAILED: ${name}: ${msg}`);
    failures.push({ entity: name, error: msg });
  }
}

// ── Tenant + settings cluster ───────────────────────────────────────────

async function migrateSubscriptionPlans() {
  const plans = await SubscriptionPlan.find().lean();
  await batchCreate('subscription_plans', plans, batch =>
    prisma.subscriptionPlan.createMany({
      skipDuplicates: true,
      data: batch.map(p => ({
        id: oidRequired(p._id, 'SubscriptionPlan._id'),
        name: p.name,
        tier: p.tier,
        description: p.description ?? null,
        priceMonthly: p.price?.monthly ?? 0,
        priceSetupFee: p.price?.setupFee ?? 0,
        priceCurrency: p.price?.currency ?? 'PHP',
        reactivationFee: p.reactivationFee ?? 500,
        maxUsers: p.features?.maxUsers ?? -1,
        maxBranches: p.features?.maxBranches ?? -1,
        maxProducts: p.features?.maxProducts ?? -1,
        maxTransactions: p.features?.maxTransactions ?? -1,
        enableInventory: p.features?.enableInventory ?? true,
        enableCategories: p.features?.enableCategories ?? true,
        enableDiscounts: p.features?.enableDiscounts ?? false,
        enableLoyaltyProgram: p.features?.enableLoyaltyProgram ?? false,
        enableCustomerManagement: p.features?.enableCustomerManagement ?? false,
        enableBookingScheduling: p.features?.enableBookingScheduling ?? false,
        enableTableManagement: p.features?.enableTableManagement ?? false,
        enableReports: p.features?.enableReports ?? true,
        enableMultiBranch: p.features?.enableMultiBranch ?? false,
        enableHardwareIntegration: p.features?.enableHardwareIntegration ?? false,
        prioritySupport: p.features?.prioritySupport ?? false,
        customIntegrations: p.features?.customIntegrations ?? false,
        dedicatedAccountManager: p.features?.dedicatedAccountManager ?? false,
        birPtuAssistance: p.birCompliance?.ptuAssistance ?? false,
        birReceiptFormatting: p.birCompliance?.receiptFormatting ?? false,
        birDocumentation: p.birCompliance?.birDocumentation ?? false,
        birCasReporting: p.birCompliance?.casReporting ?? false,
        birAuditTrailSystem: p.birCompliance?.auditTrailSystem ?? false,
        birMonthlySupport: p.birCompliance?.monthlySupport ?? false,
        pharmacyComplianceEnabled: p.pharmacyCompliance?.enablePharmacyCompliance ?? false,
        prescriptionManagement: p.pharmacyCompliance?.prescriptionManagement ?? false,
        expiryTracking: p.pharmacyCompliance?.expiryTracking ?? false,
        pdeaReporting: p.pharmacyCompliance?.pdeaReporting ?? false,
        isActive: p.isActive ?? true,
        isCustom: p.isCustom ?? false,
        availableToNewTenants: p.availableToNewTenants ?? true,
        yearlyDiscount: p.yearlyDiscount ?? 0,
        createdAt: p.createdAt ?? new Date(),
        updatedAt: p.updatedAt ?? new Date(),
      })),
    })
  );
}

async function migrateCouponsAndPlans() {
  const coupons = await Coupon.find().lean();
  await batchCreate('coupons', coupons, batch =>
    prisma.coupon.createMany({
      skipDuplicates: true,
      data: batch.map(c => ({
        id: oidRequired(c._id, 'Coupon._id'),
        code: c.code,
        description: c.description ?? null,
        discountType: c.discountType,
        discountValue: c.discountValue,
        appliesTo: c.appliesTo ?? 'all_plans',
        maxUses: c.maxUses ?? null,
        usedCount: c.usedCount ?? 0,
        validFrom: c.validFrom ?? new Date(),
        validUntil: c.validUntil ?? null,
        isActive: c.isActive ?? true,
        createdById: oidRequired(c.createdBy, 'Coupon.createdBy'),
        createdAt: c.createdAt ?? new Date(),
        updatedAt: c.updatedAt ?? new Date(),
      })),
    })
  );

  const couponPlans = coupons.flatMap(c =>
    (c.planIds ?? []).map((planId: unknown) => ({
      couponId: oidRequired(c._id, 'Coupon._id'),
      planId: oidRequired(planId, 'Coupon.planIds[]'),
    }))
  );
  await batchCreate('coupon_plans', couponPlans, batch =>
    prisma.couponPlan.createMany({ skipDuplicates: true, data: batch })
  );
}

/** Flatten the Mongoose Tenant.settings nested object + explode its child arrays/maps. */
async function migrateTenants() {
  const tenants = await Tenant.find().lean();

  await batchCreate('tenants', tenants, batch =>
    prisma.tenant.createMany({
      skipDuplicates: true,
      data: batch.map(t => ({
        id: oidRequired(t._id, 'Tenant._id'),
        slug: t.slug,
        name: t.name,
        domain: t.domain ?? null,
        subdomain: t.subdomain ?? null,
        isActive: t.isActive ?? true,
        onboardingStatus: t.onboardingStatus ?? 'not_started',
        notes: t.notes ?? null,
        createdById: oid(t.createdBy),
        grandTotalSales: t.grandTotalSales ?? 0,
        grandTotalTransactionCount: t.grandTotalTransactionCount ?? 0,
        createdAt: t.createdAt ?? new Date(),
        updatedAt: t.updatedAt ?? new Date(),
      })),
    })
  );

  const tenantSettingsRows = tenants.map(t => {
    const s = (t.settings ?? {}) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    return {
      tenantId: oidRequired(t._id, 'Tenant._id'),
      currency: s.currency ?? 'USD',
      currencySymbol: s.currencySymbol ?? null,
      currencyPosition: s.currencyPosition ?? 'before',
      dateFormat: s.dateFormat ?? 'MM/DD/YYYY',
      timeFormat: s.timeFormat ?? '12h',
      timezone: s.timezone ?? 'Asia/Manila',
      language: s.language ?? 'en',
      decimalSeparator: s.numberFormat?.decimalSeparator ?? '.',
      thousandsSeparator: s.numberFormat?.thousandsSeparator ?? ',',
      decimalPlaces: s.numberFormat?.decimalPlaces ?? 2,
      companyName: s.companyName ?? null,
      logo: s.logo ?? null,
      favicon: s.favicon ?? null,
      primaryColor: s.primaryColor ?? '#35979c',
      secondaryColor: s.secondaryColor ?? null,
      accentColor: s.accentColor ?? null,
      backgroundColor: s.backgroundColor ?? null,
      textColor: s.textColor ?? null,
      email: s.email ?? null,
      phone: s.phone ?? null,
      addressStreet: s.address?.street ?? null,
      addressCity: s.address?.city ?? null,
      addressState: s.address?.state ?? null,
      addressZipCode: s.address?.zipCode ?? null,
      addressCountry: s.address?.country ?? null,
      website: s.website ?? null,
      receiptHeader: s.receiptHeader ?? null,
      receiptFooter: s.receiptFooter ?? null,
      receiptShowLogo: s.receiptShowLogo ?? true,
      receiptShowAddress: s.receiptShowAddress ?? true,
      receiptShowPhone: s.receiptShowPhone ?? false,
      receiptShowEmail: s.receiptShowEmail ?? false,
      receiptDefaultTemplateId: s.receiptTemplates?.default ?? null,
      taxEnabled: s.taxEnabled ?? false,
      taxRate: s.taxRate ?? 0,
      taxLabel: s.taxLabel ?? 'Tax',
      businessType: s.businessType ?? null,
      taxId: s.taxId ?? null,
      registrationNumber: s.registrationNumber ?? null,
      birTin: s.birTin ?? null,
      birPtuNumber: s.birPtuNumber ?? null,
      birPtuIssuedDate: s.birPtuIssuedDate ?? null,
      birPtuExpiryDate: s.birPtuExpiryDate ?? null,
      birMinNumber: s.birMinNumber ?? null,
      birBusinessStyle: s.birBusinessStyle ?? null,
      birSystemProvider: s.birSystemProvider ?? null,
      birTerminalSN: s.birTerminalSN ?? null,
      birAccreditationNo: s.birAccreditationNo ?? null,
      birAccreditationDate: s.birAccreditationDate ?? null,
      birAccreditationValidUntil: s.birAccreditationValidUntil ?? null,
      birEsalesPushUrl: s.birEsalesPushUrl ?? null,
      mayorsPermitNumber: s.businessPermits?.mayorsPermitNumber ?? null,
      mayorsPermitExpiry: s.businessPermits?.mayorsPermitExpiry ?? null,
      barangayClearanceNumber: s.businessPermits?.barangayClearanceNumber ?? null,
      barangayClearanceExpiry: s.businessPermits?.barangayClearanceExpiry ?? null,
      dtiSecRegistration: s.businessPermits?.dtiSecRegistration ?? null,
      birCertificateOfRegistration: s.businessPermits?.birCertificateOfRegistration ?? null,
      fireSafetyInspectionCertificate: s.businessPermits?.fireSafetyInspectionCertificate ?? null,
      fsicExpiry: s.businessPermits?.fsicExpiry ?? null,
      sanitaryPermitNumber: s.businessPermits?.sanitaryPermitNumber ?? null,
      sanitaryPermitExpiry: s.businessPermits?.sanitaryPermitExpiry ?? null,
      fdaFoodBusinessLicense: s.restaurantCompliance?.fdaFoodBusinessLicense ?? null,
      fdaFblExpiry: s.restaurantCompliance?.fdaFblExpiry ?? null,
      foodSafetyCertificateNumber: s.restaurantCompliance?.foodSafetyCertificateNumber ?? null,
      foodSafetyCertificateExpiry: s.restaurantCompliance?.foodSafetyCertificateExpiry ?? null,
      foodHandlersCertified: s.restaurantCompliance?.foodHandlersCertified ?? false,
      numberOfCertifiedHandlers: s.restaurantCompliance?.numberOfCertifiedHandlers ?? null,
      healthCertificateExpiry: s.restaurantCompliance?.healthCertificateExpiry ?? null,
      kitchenSanitationCompliant: s.restaurantCompliance?.kitchenSanitationCompliant ?? false,
      dtiBusinessNameRegistration: s.retailCompliance?.dtiBusinessNameRegistration ?? null,
      priceTaggingCompliant: s.retailCompliance?.priceTaggingCompliant ?? false,
      weightsAndMeasuresCompliant: s.retailCompliance?.weightsAndMeasuresCompliant ?? false,
      btiAccreditation: s.retailCompliance?.btiAccreditation ?? null,
      productLabelsCompliant: s.retailCompliance?.productLabelsCompliant ?? false,
      environmentalComplianceCertificate: s.laundryCompliance?.environmentalComplianceCertificate ?? null,
      eccExpiry: s.laundryCompliance?.eccExpiry ?? null,
      wastewaterDischargePermit: s.laundryCompliance?.wastewaterDischargePermit ?? null,
      wastewaterPermitExpiry: s.laundryCompliance?.wastewaterPermitExpiry ?? null,
      solidWasteManagementPlan: s.laundryCompliance?.solidWasteManagementPlan ?? false,
      serviceDohAccreditation: s.serviceCompliance?.dohAccreditation ?? null,
      serviceDohAccreditationExpiry: s.serviceCompliance?.dohAccreditationExpiry ?? null,
      pharmacistName: s.pharmacyCompliance?.pharmacistName ?? null,
      pharmacistPRCNumber: s.pharmacyCompliance?.pharmacistPRCNumber ?? null,
      pharmacistPTRNumber: s.pharmacyCompliance?.pharmacistPTRNumber ?? null,
      fdaLTO: s.pharmacyCompliance?.fdaLTO ?? null,
      fdaLTOExpiryDate: s.pharmacyCompliance?.fdaLTOExpiryDate ?? null,
      pharmacyDohAccreditation: s.pharmacyCompliance?.dohAccreditation ?? null,
      pdeaLicense: s.pharmacyCompliance?.pdeaLicense ?? null,
      pdeaLicenseExpiry: s.pharmacyCompliance?.pdeaLicenseExpiry ?? null,
      requirePrescriptionForRx: s.pharmacyCompliance?.requirePrescriptionForRx ?? true,
      trackExpiryDates: s.pharmacyCompliance?.trackExpiryDates ?? true,
      expiryAlertDays: s.pharmacyCompliance?.expiryAlertDays ?? 90,
      lowStockThreshold: s.lowStockThreshold ?? 10,
      lowStockAlert: s.lowStockAlert ?? true,
      emailNotifications: s.emailNotifications ?? false,
      smsNotifications: s.smsNotifications ?? false,
      attendanceNotificationsEnabled: s.attendanceNotifications?.enabled ?? true,
      attendanceExpectedStartTime: s.attendanceNotifications?.expectedStartTime ?? '09:00',
      attendanceMaxHoursWithoutClockOut: s.attendanceNotifications?.maxHoursWithoutClockOut ?? 12,
      enableInventory: s.enableInventory ?? true,
      enableCategories: s.enableCategories ?? true,
      enableDiscounts: s.enableDiscounts ?? false,
      enableLoyaltyProgram: s.enableLoyaltyProgram ?? false,
      enableCustomerManagement: s.enableCustomerManagement ?? false,
      enableOnAccountSales: s.enableOnAccountSales ?? false,
      autoOpenDrawerOnShiftStart: s.autoOpenDrawerOnShiftStart ?? false,
      autoOpenDrawerOnShiftEnd: s.autoOpenDrawerOnShiftEnd ?? false,
      enableBookingScheduling: s.enableBookingScheduling ?? false,
      enableTableManagement: s.enableTableManagement ?? false,
      ecommerceShopifyEnabled: s.integrations?.ecommerce?.shopifyEnabled ?? false,
      ecommerceWooCommerceEnabled: s.integrations?.ecommerce?.wooCommerceEnabled ?? false,
      printerType: s.hardwareConfig?.printer?.type ?? null,
      printerProfile: s.hardwareConfig?.printer?.profile ?? null,
      printerVendorId: s.hardwareConfig?.printer?.vendorId ?? null,
      printerProductId: s.hardwareConfig?.printer?.productId ?? null,
      printerIpAddress: s.hardwareConfig?.printer?.ipAddress ?? null,
      printerPortNumber: s.hardwareConfig?.printer?.portNumber ?? null,
      barcodeScannerType: s.hardwareConfig?.barcodeScanner?.type ?? null,
      barcodeScannerEnabled: s.hardwareConfig?.barcodeScanner?.enabled ?? null,
      qrReaderEnabled: s.hardwareConfig?.qrReader?.enabled ?? null,
      qrReaderCameraId: s.hardwareConfig?.qrReader?.cameraId ?? null,
      cashDrawerEnabled: s.hardwareConfig?.cashDrawer?.enabled ?? null,
      cashDrawerConnectedToPrinter: s.hardwareConfig?.cashDrawer?.connectedToPrinter ?? null,
      touchscreenEnabled: s.hardwareConfig?.touchscreen?.enabled ?? null,
      multiCurrencyEnabled: s.multiCurrency?.enabled ?? false,
      displayCurrencies: s.multiCurrency?.displayCurrencies ?? [],
      exchangeRateSource: s.multiCurrency?.exchangeRateSource ?? 'manual',
      exchangeRateApiKey: s.multiCurrency?.exchangeRateApiKey ?? null,
      exchangeRateLastUpdated: s.multiCurrency?.lastUpdated ?? null,
      emailBookingConfirmationTemplate: s.notificationTemplates?.email?.bookingConfirmation ?? null,
      emailBookingReminderTemplate: s.notificationTemplates?.email?.bookingReminder ?? null,
      emailBookingCancellationTemplate: s.notificationTemplates?.email?.bookingCancellation ?? null,
      emailLowStockAlertTemplate: s.notificationTemplates?.email?.lowStockAlert ?? null,
      emailAttendanceAlertTemplate: s.notificationTemplates?.email?.attendanceAlert ?? null,
      smsBookingConfirmationTemplate: s.notificationTemplates?.sms?.bookingConfirmation ?? null,
      smsBookingReminderTemplate: s.notificationTemplates?.sms?.bookingReminder ?? null,
      smsBookingCancellationTemplate: s.notificationTemplates?.sms?.bookingCancellation ?? null,
      smsLowStockAlertTemplate: s.notificationTemplates?.sms?.lowStockAlert ?? null,
      fontFamily: s.advancedBranding?.fontFamily ?? null,
      fontSource: s.advancedBranding?.fontSource ?? 'system',
      googleFontUrl: s.advancedBranding?.googleFontUrl ?? null,
      customFontUrl: s.advancedBranding?.customFontUrl ?? null,
      theme: s.advancedBranding?.theme ?? 'light',
      customThemeCss: s.advancedBranding?.customTheme?.css ?? null,
      borderRadius: s.advancedBranding?.borderRadius ?? 'md',
      customBorderRadius: s.advancedBranding?.customBorderRadius ?? null,
      businessHoursTimezone: s.businessHours?.timezone ?? null,
      updatedAt: t.updatedAt ?? new Date(),
    };
  });
  await batchCreate('tenant_settings', tenantSettingsRows, batch =>
    prisma.tenantSettings.createMany({ skipDuplicates: true, data: batch })
  );

  // rolePermissionOverrides — deliberate JSONB passthrough
  const overrideRows = tenants
    .filter(t => (t.settings as any)?.rolePermissionOverrides && Object.keys((t.settings as any).rolePermissionOverrides).length > 0) // eslint-disable-line @typescript-eslint/no-explicit-any
    .map(t => ({
      tenantId: oidRequired(t._id, 'Tenant._id'),
      overrides: toJsonSafe((t.settings as any).rolePermissionOverrides) as object, // eslint-disable-line @typescript-eslint/no-explicit-any
      updatedAt: t.updatedAt ?? new Date(),
    }));
  await batchCreate('tenant_role_permission_overrides', overrideRows, batch =>
    prisma.tenantRolePermissionOverride.createMany({ skipDuplicates: true, data: batch })
  );

  // practitionerLicenses[] (no Mongo _id per subdoc — synthesize a deterministic id)
  const licenseRows = tenants.flatMap(t => {
    const licenses = ((t.settings as any)?.serviceCompliance?.practitionerLicenses ?? []) as any[]; // eslint-disable-line @typescript-eslint/no-explicit-any
    return licenses.map((l, idx) => ({
      id: `${String(t._id)}-lic-${idx}`,
      tenantId: oidRequired(t._id, 'Tenant._id'),
      name: l.name ?? null,
      licenseType: l.licenseType ?? null,
      prcNumber: l.prcNumber ?? null,
      ptrNumber: l.ptrNumber ?? null,
      licenseExpiry: l.licenseExpiry ?? null,
    }));
  });
  await batchCreate('tenant_practitioner_licenses', licenseRows, batch =>
    prisma.tenantPractitionerLicense.createMany({ skipDuplicates: true, data: batch })
  );

  // exchangeRates Map<string, number> -> TenantExchangeRate rows
  const exchangeRateRows = tenants.flatMap(t => {
    const rates = mapToObject<number>((t.settings as any)?.multiCurrency?.exchangeRates); // eslint-disable-line @typescript-eslint/no-explicit-any
    return Object.entries(rates).map(([currencyCode, rate]) => ({
      id: `${String(t._id)}-fx-${currencyCode}`,
      tenantId: oidRequired(t._id, 'Tenant._id'),
      currencyCode,
      rate: rate as number,
    }));
  });
  await batchCreate('tenant_exchange_rates', exchangeRateRows, batch =>
    prisma.tenantExchangeRate.createMany({ skipDuplicates: true, data: batch })
  );

  // advancedBranding.customTheme.variables Map<string, string> -> TenantThemeVariable rows
  const themeVarRows = tenants.flatMap(t => {
    const vars = mapToObject<string>((t.settings as any)?.advancedBranding?.customTheme?.variables); // eslint-disable-line @typescript-eslint/no-explicit-any
    return Object.entries(vars).map(([name, value]) => ({
      id: `${String(t._id)}-theme-${name}`,
      tenantId: oidRequired(t._id, 'Tenant._id'),
      name,
      value: value as string,
    }));
  });
  await batchCreate('tenant_theme_variables', themeVarRows, batch =>
    prisma.tenantThemeVariable.createMany({ skipDuplicates: true, data: batch })
  );

  // receiptTemplates.templates[]
  const receiptTemplateRows = tenants.flatMap(t => {
    const templates = ((t.settings as any)?.receiptTemplates?.templates ?? []) as any[]; // eslint-disable-line @typescript-eslint/no-explicit-any
    return templates.map((tpl, idx) => ({
      id: tpl.id ? String(tpl.id) : `${String(t._id)}-tpl-${idx}`,
      tenantId: oidRequired(t._id, 'Tenant._id'),
      name: tpl.name ?? `Template ${idx + 1}`,
      html: tpl.html ?? '',
      isDefault: tpl.isDefault ?? false,
      createdAt: tpl.createdAt ?? new Date(),
      updatedAt: tpl.updatedAt ?? new Date(),
    }));
  });
  await batchCreate('tenant_receipt_templates', receiptTemplateRows, batch =>
    prisma.tenantReceiptTemplate.createMany({ skipDuplicates: true, data: batch })
  );

  // businessHours.schedule Map<dayOfWeek, {enabled, openTime, closeTime, breaks[]}>
  const businessHourRows: { id: string; tenantId: string; dayOfWeek: number; enabled: boolean; openTime: string | null; closeTime: string | null }[] = [];
  const businessHourBreakRows: { id: string; businessHourId: string; start: string; end: string }[] = [];
  for (const t of tenants) {
    const schedule = mapToObject<any>((t.settings as any)?.businessHours?.schedule); // eslint-disable-line @typescript-eslint/no-explicit-any
    for (const [dayKey, day] of Object.entries(schedule)) {
      const dayOfWeek = Number(dayKey);
      if (Number.isNaN(dayOfWeek)) continue;
      const bhId = `${String(t._id)}-bh-${dayOfWeek}`;
      businessHourRows.push({
        id: bhId,
        tenantId: oidRequired(t._id, 'Tenant._id'),
        dayOfWeek,
        enabled: day?.enabled ?? true,
        openTime: day?.openTime ?? null,
        closeTime: day?.closeTime ?? null,
      });
      const breaks = (day?.breaks ?? []) as any[]; // eslint-disable-line @typescript-eslint/no-explicit-any
      breaks.forEach((b, idx) => {
        businessHourBreakRows.push({
          id: `${bhId}-brk-${idx}`,
          businessHourId: bhId,
          start: b.start,
          end: b.end,
        });
      });
    }
  }
  await batchCreate('tenant_business_hours', businessHourRows, batch =>
    prisma.tenantBusinessHour.createMany({ skipDuplicates: true, data: batch })
  );
  await batchCreate('tenant_business_hour_breaks', businessHourBreakRows, batch =>
    prisma.tenantBusinessHourBreak.createMany({ skipDuplicates: true, data: batch })
  );

  // businessHours.specialHours[]
  const specialHourRows = tenants.flatMap(t => {
    const special = ((t.settings as any)?.businessHours?.specialHours ?? []) as any[]; // eslint-disable-line @typescript-eslint/no-explicit-any
    return special.map((sh, idx) => ({
      id: `${String(t._id)}-sh-${idx}`,
      tenantId: oidRequired(t._id, 'Tenant._id'),
      date: sh.date,
      enabled: sh.enabled ?? true,
      openTime: sh.openTime ?? null,
      closeTime: sh.closeTime ?? null,
      note: sh.note ?? null,
    }));
  });
  await batchCreate('tenant_special_hours', specialHourRows, batch =>
    prisma.tenantSpecialHours.createMany({ skipDuplicates: true, data: batch })
  );

  // holidays[]
  const holidayRows = tenants.flatMap(t => {
    const holidays = ((t.settings as any)?.holidays ?? []) as any[]; // eslint-disable-line @typescript-eslint/no-explicit-any
    return holidays.map((h, idx) => ({
      id: h.id ? String(h.id) : `${String(t._id)}-hol-${idx}`,
      tenantId: oidRequired(t._id, 'Tenant._id'),
      name: h.name,
      date: h.date,
      type: h.type ?? 'single',
      recurringPattern: h.recurring?.pattern ?? null,
      recurringDayOfMonth: h.recurring?.dayOfMonth ?? null,
      recurringDayOfWeek: h.recurring?.dayOfWeek ?? null,
      recurringMonth: h.recurring?.month ?? null,
      isBusinessClosed: h.isBusinessClosed ?? true,
      createdAt: h.createdAt ?? new Date(),
    }));
  });
  await batchCreate('tenant_holidays', holidayRows, batch =>
    prisma.tenantHoliday.createMany({ skipDuplicates: true, data: batch })
  );

  // settings.taxRules[] (embedded, distinct from the standalone TaxRule collection below)
  const settingsTaxRuleRows = tenants.flatMap(t => {
    const rules = ((t.settings as any)?.taxRules ?? []) as any[]; // eslint-disable-line @typescript-eslint/no-explicit-any
    return rules.map((r, idx) => ({
      id: r.id ? String(r.id) : `${String(t._id)}-str-${idx}`,
      tenantId: oidRequired(t._id, 'Tenant._id'),
      name: r.name,
      rate: r.rate ?? 0,
      label: r.label ?? 'Tax',
      appliesTo: r.appliesTo ?? 'all',
      regionCountry: r.region?.country ?? null,
      regionState: r.region?.state ?? null,
      regionCity: r.region?.city ?? null,
      regionZipCodes: r.region?.zipCodes ?? [],
      priority: r.priority ?? 0,
      isActive: r.isActive ?? true,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
  });
  // Note: these embedded settings.taxRules[] entries land in the same tax_rules
  // table as the standalone TaxRule collection (see migrateTaxRules below) —
  // both sources feed prisma.taxRule, ids are kept distinct via the "-str-" suffix.
  await batchCreate('tax_rules (from tenant.settings.taxRules[])', settingsTaxRuleRows, batch =>
    prisma.taxRule.createMany({ skipDuplicates: true, data: batch })
  );
}

// ── Users, addresses, branches, devices ─────────────────────────────────

async function migrateBranches() {
  const branches = await Branch.find().lean();
  await batchCreate('branches', branches, batch =>
    prisma.branch.createMany({
      skipDuplicates: true,
      data: batch.map(b => ({
        id: oidRequired(b._id, 'Branch._id'),
        tenantId: oidRequired(b.tenantId, 'Branch.tenantId'),
        name: b.name,
        code: b.code ?? null,
        street: b.address?.street ?? null,
        city: b.address?.city ?? null,
        state: b.address?.state ?? null,
        zipCode: b.address?.zipCode ?? null,
        country: b.address?.country ?? null,
        phone: b.phone ?? null,
        email: b.email ?? null,
        managerId: oid(b.managerId),
        isActive: b.isActive ?? true,
        createdAt: b.createdAt ?? new Date(),
        updatedAt: b.updatedAt ?? new Date(),
      })),
    })
  );
}

async function migrateUsers() {
  const users = await User.find().select('+password').lean();
  await batchCreate('users', users, batch =>
    prisma.user.createMany({
      skipDuplicates: true,
      data: batch.map(u => ({
        id: oidRequired(u._id, 'User._id'),
        email: u.email,
        password: u.password,
        name: u.name,
        role: u.role,
        tenantId: oid(u.tenantId),
        branchId: oid(u.branchId),
        isActive: u.isActive ?? true,
        lastLogin: u.lastLogin ?? null,
        qrToken: u.qrToken ?? null,
        createdAt: u.createdAt ?? new Date(),
        updatedAt: u.updatedAt ?? new Date(),
      })),
    })
  );
}

async function migrateAddresses() {
  const addresses = await Address.find().lean();
  await batchCreate('addresses', addresses, batch =>
    prisma.address.createMany({
      skipDuplicates: true,
      data: batch.map(a => ({
        id: oidRequired(a._id, 'Address._id'),
        userId: oidRequired(a.userId, 'Address.userId'),
        tenantId: oidRequired(a.tenantId, 'Address.tenantId'),
        label: a.label ?? 'Home',
        street: a.street,
        city: a.city,
        state: a.state ?? null,
        zipCode: a.zipCode ?? null,
        country: a.country,
        isDefault: a.isDefault ?? false,
        isActive: a.isActive ?? true,
        createdAt: a.createdAt ?? new Date(),
        updatedAt: a.updatedAt ?? new Date(),
      })),
    })
  );
}

async function migrateDevices() {
  const devices = await Device.find().lean();
  await batchCreate('devices', devices, batch =>
    prisma.device.createMany({
      skipDuplicates: true,
      data: batch.map(d => ({
        id: oidRequired(d._id, 'Device._id'),
        tenantId: oidRequired(d.tenantId, 'Device.tenantId'),
        branchId: oidRequired(d.branchId, 'Device.branchId'),
        label: d.label,
        serialNumber: d.serialNumber,
        terminalId: d.terminalId,
        ptuNumber: d.ptuNumber ?? null,
        ptuStatus: d.ptuStatus ?? 'pending',
        isActive: d.isActive ?? true,
        registeredById: oidRequired(d.registeredBy, 'Device.registeredBy'),
        createdAt: d.createdAt ?? new Date(),
        updatedAt: d.updatedAt ?? new Date(),
      })),
    })
  );
}

// ── Catalog: categories, products, bundles, channel listings ────────────

async function migrateCategories() {
  const categories = await Category.find().lean();
  await batchCreate('categories', categories, batch =>
    prisma.category.createMany({
      skipDuplicates: true,
      data: batch.map(c => ({
        id: oidRequired(c._id, 'Category._id'),
        tenantId: oidRequired(c.tenantId, 'Category.tenantId'),
        name: c.name,
        description: c.description ?? null,
        isActive: c.isActive ?? true,
        createdAt: c.createdAt ?? new Date(),
        updatedAt: c.updatedAt ?? new Date(),
      })),
    })
  );
}

async function migrateProducts() {
  const allProducts = await Product.find().lean();
  const products = allProducts.filter((p) => {
    if (!oid(p.tenantId)) {
      log(`  SKIPPED Product ${p._id} ("${p.name}"): no tenantId (orphaned record, not migrated)`);
      return false;
    }
    return true;
  });

  // Mongo never enforced barcode uniqueness; the new schema does
  // (@@unique([tenantId, barcode])). Null out the barcode on every duplicate
  // past the first per (tenantId, barcode) so the product still migrates —
  // losing a stale/duplicate barcode is safer than losing the product.
  const seenBarcodes = new Set<string>();
  for (const p of products as any[]) { // eslint-disable-line @typescript-eslint/no-explicit-any
    if (!p.barcode) continue;
    const key = `${String(p.tenantId)}::${p.barcode}`;
    if (seenBarcodes.has(key)) {
      log(`  WARN: Product ${p._id} ("${p.name}") has duplicate barcode "${p.barcode}" for its tenant — barcode cleared, product still migrated`);
      p.barcode = null;
    } else {
      seenBarcodes.add(key);
    }
  }

  await batchCreate('products', products, batch =>
    prisma.product.createMany({
      skipDuplicates: true,
      data: batch.map(p => ({
        id: oidRequired(p._id, 'Product._id'),
        tenantId: oidRequired(p.tenantId, 'Product.tenantId'),
        name: p.name,
        description: p.description ?? null,
        price: p.price,
        stock: clampInt32(p.stock, 'Product.stock', String(p._id)),
        sku: p.sku ?? null,
        barcode: p.barcode ?? null,
        category: p.category ?? null,
        categoryId: oid(p.categoryId),
        image: p.image ?? null,
        productType: p.productType ?? 'regular',
        hasVariations: p.hasVariations ?? false,
        taxExempt: p.taxExempt ?? false,
        zeroRated: p.zeroRated ?? false,
        trackInventory: p.trackInventory ?? true,
        allowOutOfStockSales: p.allowOutOfStockSales ?? false,
        lowStockThreshold: p.lowStockThreshold != null ? clampInt32(p.lowStockThreshold, 'Product.lowStockThreshold', String(p._id)) : null,
        pinned: p.pinned ?? false,
        isActive: p.isActive ?? true,
        createdAt: p.createdAt ?? new Date(),
        updatedAt: p.updatedAt ?? new Date(),
      })),
    })
  );

  const variationRows = products.flatMap(p =>
    ((p.variations ?? []) as any[]).map((v, idx) => ({ // eslint-disable-line @typescript-eslint/no-explicit-any
      id: v._id ? String(v._id) : `${String(p._id)}-var-${idx}`,
      productId: oidRequired(p._id, 'Product._id'),
      size: v.size ?? null,
      color: v.color ?? null,
      type: v.type ?? null,
      sku: v.sku ?? null,
      price: v.price ?? null,
      stock: clampInt32(v.stock, 'Product.variations[].stock', String(p._id)),
    }))
  );
  await batchCreate('product_variations', variationRows, batch =>
    prisma.productVariation.createMany({ skipDuplicates: true, data: batch })
  );

  const branchStockRows = products.flatMap(p =>
    ((p.branchStock ?? []) as any[]).map((bs, idx) => ({ // eslint-disable-line @typescript-eslint/no-explicit-any
      id: bs._id ? String(bs._id) : `${String(p._id)}-bs-${idx}`,
      productId: oidRequired(p._id, 'Product._id'),
      branchId: oidRequired(bs.branchId, 'Product.branchStock[].branchId'),
      stock: clampInt32(bs.stock, 'Product.branchStock[].stock', String(p._id)),
    }))
  );
  await batchCreate('product_branch_stock', branchStockRows, batch =>
    prisma.productBranchStock.createMany({ skipDuplicates: true, data: batch })
  );

  const modifierRows: { id: string; productId: string; name: string; required: boolean }[] = [];
  const modifierOptionRows: { id: string; modifierId: string; name: string; price: number }[] = [];
  for (const p of products) {
    const modifiers = ((p as any).modifiers ?? []) as any[]; // eslint-disable-line @typescript-eslint/no-explicit-any
    modifiers.forEach((m, mIdx) => {
      const modId = m._id ? String(m._id) : `${String(p._id)}-mod-${mIdx}`;
      modifierRows.push({
        id: modId,
        productId: oidRequired(p._id, 'Product._id'),
        name: m.name,
        required: m.required ?? false,
      });
      (m.options ?? []).forEach((o: any, oIdx: number) => { // eslint-disable-line @typescript-eslint/no-explicit-any
        modifierOptionRows.push({
          id: o._id ? String(o._id) : `${modId}-opt-${oIdx}`,
          modifierId: modId,
          name: o.name,
          price: o.price ?? 0,
        });
      });
    });
  }
  await batchCreate('product_modifiers', modifierRows, batch =>
    prisma.productModifier.createMany({ skipDuplicates: true, data: batch })
  );
  await batchCreate('product_modifier_options', modifierOptionRows, batch =>
    prisma.productModifierOption.createMany({ skipDuplicates: true, data: batch })
  );

  // Industry detail tables — 1:1, only created when at least one relevant field is present.
  const restaurantRows = products
    .filter(p => (p as any).allergens?.length || (p as any).nutritionInfo)
    .map(p => ({
      productId: oidRequired(p._id, 'Product._id'),
      allergens: (p as any).allergens ?? [],
      calories: (p as any).nutritionInfo?.calories ?? null,
      protein: (p as any).nutritionInfo?.protein ?? null,
      carbs: (p as any).nutritionInfo?.carbs ?? null,
      fat: (p as any).nutritionInfo?.fat ?? null,
    }));
  await batchCreate('product_restaurant_details', restaurantRows, batch =>
    prisma.productRestaurantDetails.createMany({ skipDuplicates: true, data: batch })
  );

  const laundryRows = products
    .filter(p => (p as any).serviceType || (p as any).weightBased || (p as any).pickupDelivery || (p as any).estimatedDuration)
    .map(p => ({
      productId: oidRequired(p._id, 'Product._id'),
      serviceType: (p as any).serviceType ?? null,
      weightBased: (p as any).weightBased ?? false,
      pickupDelivery: (p as any).pickupDelivery ?? false,
      estimatedDuration: (p as any).estimatedDuration ?? null,
    }));
  await batchCreate('product_laundry_details', laundryRows, batch =>
    prisma.productLaundryDetails.createMany({ skipDuplicates: true, data: batch })
  );

  const serviceRows = products
    .filter(p => (p as any).serviceDuration || (p as any).staffRequired || (p as any).equipmentRequired?.length)
    .map(p => ({
      productId: oidRequired(p._id, 'Product._id'),
      serviceDuration: (p as any).serviceDuration ?? null,
      staffRequired: (p as any).staffRequired ?? 1,
      equipmentRequired: (p as any).equipmentRequired ?? [],
    }));
  await batchCreate('product_service_details', serviceRows, batch =>
    prisma.productServiceDetails.createMany({ skipDuplicates: true, data: batch })
  );

  const pharmacyRows = products
    .filter(p =>
      (p as any).genericName || (p as any).manufacturer || (p as any).prn || (p as any).batchNumber ||
      (p as any).expiryDate || (p as any).drugSchedule || (p as any).requiresPrescription ||
      (p as any).storageConditions || (p as any).activeIngredient || (p as any).dosageStrength || (p as any).dosageForm
    )
    .map(p => ({
      productId: oidRequired(p._id, 'Product._id'),
      genericName: (p as any).genericName ?? null,
      manufacturer: (p as any).manufacturer ?? null,
      prn: (p as any).prn ?? null,
      batchNumber: (p as any).batchNumber ?? null,
      expiryDate: (p as any).expiryDate ?? null,
      drugSchedule: (p as any).drugSchedule ?? null,
      requiresPrescription: (p as any).requiresPrescription ?? false,
      storageConditions: (p as any).storageConditions ?? null,
      activeIngredient: (p as any).activeIngredient ?? null,
      dosageStrength: (p as any).dosageStrength ?? null,
      dosageForm: (p as any).dosageForm ?? null,
    }));
  await batchCreate('product_pharmacy_details', pharmacyRows, batch =>
    prisma.productPharmacyDetails.createMany({ skipDuplicates: true, data: batch })
  );
}

async function migrateProductBundles() {
  const bundles = await ProductBundle.find().lean();
  await batchCreate('product_bundles', bundles, batch =>
    prisma.productBundle.createMany({
      skipDuplicates: true,
      data: batch.map(b => ({
        id: oidRequired(b._id, 'ProductBundle._id'),
        tenantId: oidRequired(b.tenantId, 'ProductBundle.tenantId'),
        name: b.name,
        description: b.description ?? null,
        price: b.price,
        sku: b.sku ?? null,
        categoryId: oid(b.categoryId),
        image: b.image ?? null,
        trackInventory: b.trackInventory ?? true,
        isActive: b.isActive ?? true,
        createdAt: b.createdAt ?? new Date(),
        updatedAt: b.updatedAt ?? new Date(),
      })),
    })
  );

  const itemRows = bundles.flatMap(b =>
    ((b.items ?? []) as any[]).map((it, idx) => ({ // eslint-disable-line @typescript-eslint/no-explicit-any
      id: it._id ? String(it._id) : `${String(b._id)}-item-${idx}`,
      bundleId: oidRequired(b._id, 'ProductBundle._id'),
      productId: oidRequired(it.productId, 'ProductBundle.items[].productId'),
      productName: it.productName,
      quantity: it.quantity,
      variationSize: it.variation?.size ?? null,
      variationColor: it.variation?.color ?? null,
      variationType: it.variation?.type ?? null,
    }))
  );
  await batchCreate('product_bundle_items', itemRows, batch =>
    prisma.productBundleItem.createMany({ skipDuplicates: true, data: batch })
  );
}

async function migrateProductChannelListings() {
  const listings = await ProductChannelListing.find().lean();
  await batchCreate('product_channel_listings', listings, batch =>
    prisma.productChannelListing.createMany({
      skipDuplicates: true,
      data: batch.map(l => ({
        id: oidRequired(l._id, 'ProductChannelListing._id'),
        tenantId: oidRequired(l.tenantId, 'ProductChannelListing.tenantId'),
        productId: oidRequired(l.productId, 'ProductChannelListing.productId'),
        provider: l.provider,
        externalProductId: l.externalProductId,
        externalVariantId: l.externalVariantId,
        inventoryItemId: l.inventoryItemId ?? null,
        sku: l.sku ?? null,
        variationSize: l.variation?.size ?? null,
        variationColor: l.variation?.color ?? null,
        variationType: l.variation?.type ?? null,
        createdAt: l.createdAt ?? new Date(),
        updatedAt: l.updatedAt ?? new Date(),
      })),
    })
  );
}

async function migrateTenantEcommerceIntegrations() {
  const integrations = await TenantEcommerceIntegration.find().lean();
  await batchCreate('tenant_ecommerce_integrations', integrations, batch =>
    prisma.tenantEcommerceIntegration.createMany({
      skipDuplicates: true,
      data: batch.map(i => ({
        id: oidRequired(i._id, 'TenantEcommerceIntegration._id'),
        tenantId: oidRequired(i.tenantId, 'TenantEcommerceIntegration.tenantId'),
        provider: i.provider,
        shopDomain: i.shopDomain ?? null,
        siteUrl: i.siteUrl ?? null,
        credentialsEncrypted: i.credentialsEncrypted,
        webhookSecretEncrypted: i.webhookSecretEncrypted ?? null,
        scopes: i.scopes ?? [],
        shopifyLocationId: i.shopifyLocationId ?? null,
        isActive: i.isActive ?? true,
        lastSyncAt: i.lastSyncAt ?? null,
        lastError: i.lastError ?? null,
        defaultBranchId: oid(i.defaultBranchId),
        createdAt: i.createdAt ?? new Date(),
        updatedAt: i.updatedAt ?? new Date(),
      })),
    })
  );
}

// ── Customers ─────────────────────────────────────────────────────────────

async function migrateCustomers() {
  const customers = await Customer.find().lean();
  await batchCreate('customers', customers, batch =>
    prisma.customer.createMany({
      skipDuplicates: true,
      data: batch.map(c => ({
        id: oidRequired(c._id, 'Customer._id'),
        tenantId: oidRequired(c.tenantId, 'Customer.tenantId'),
        firstName: c.firstName,
        lastName: c.lastName,
        email: c.email ?? null,
        phone: c.phone ?? null,
        dateOfBirth: c.dateOfBirth ?? null,
        notes: c.notes ?? null,
        tags: c.tags ?? [],
        totalSpent: c.totalSpent ?? 0,
        lastPurchaseDate: c.lastPurchaseDate ?? null,
        loyaltyPointsBalance: c.loyaltyPointsBalance ?? 0,
        accountBalance: c.accountBalance ?? 0,
        creditLimit: c.creditLimit ?? null,
        shopifyCustomerId: c.shopifyCustomerId ?? null,
        isActive: c.isActive ?? true,
        createdAt: c.createdAt ?? new Date(),
        updatedAt: c.updatedAt ?? new Date(),
      })),
    })
  );

  const addressRows = customers.flatMap(c =>
    ((c.addresses ?? []) as any[]).map((a, idx) => ({ // eslint-disable-line @typescript-eslint/no-explicit-any
      id: a._id ? String(a._id) : `${String(c._id)}-addr-${idx}`,
      customerId: oidRequired(c._id, 'Customer._id'),
      street: a.street ?? null,
      city: a.city ?? null,
      state: a.state ?? null,
      zipCode: a.zipCode ?? null,
      country: a.country ?? null,
      isDefault: a.isDefault ?? false,
    }))
  );
  await batchCreate('customer_addresses', addressRows, batch =>
    prisma.customerAddress.createMany({ skipDuplicates: true, data: batch })
  );
}

async function migrateCustomerOTPs() {
  const otps = await CustomerOTP.find().lean();
  await batchCreate('customer_otps', otps, batch =>
    prisma.customerOTP.createMany({
      skipDuplicates: true,
      data: batch.map(o => ({
        id: oidRequired(o._id, 'CustomerOTP._id'),
        tenantId: oidRequired(o.tenantId, 'CustomerOTP.tenantId'),
        phone: o.phone,
        otp: o.otp,
        expiresAt: o.expiresAt,
        verified: o.verified ?? false,
        attempts: o.attempts ?? 0,
        createdAt: o.createdAt ?? new Date(),
        updatedAt: (o as any).updatedAt ?? o.createdAt ?? new Date(), // eslint-disable-line @typescript-eslint/no-explicit-any
      })),
    })
  );
}

async function migrateCustomerBalancePayments() {
  const payments = await CustomerBalancePayment.find().lean();
  await batchCreate('customer_balance_payments', payments, batch =>
    prisma.customerBalancePayment.createMany({
      skipDuplicates: true,
      data: batch.map(p => ({
        id: oidRequired(p._id, 'CustomerBalancePayment._id'),
        tenantId: oidRequired(p.tenantId, 'CustomerBalancePayment.tenantId'),
        customerId: oidRequired(p.customerId, 'CustomerBalancePayment.customerId'),
        amount: p.amount,
        method: p.method,
        notes: p.notes ?? null,
        recordedById: oid(p.recordedBy),
        idempotencyKey: p.idempotencyKey ?? null,
        createdAt: p.createdAt ?? new Date(),
        updatedAt: p.updatedAt ?? new Date(),
      })),
    })
  );
}

// ── Marketing / subscriptions ───────────────────────────────────────────

async function migrateCampaigns() {
  const campaigns = await Campaign.find().lean();
  await batchCreate('campaigns', campaigns, batch =>
    prisma.campaign.createMany({
      skipDuplicates: true,
      data: batch.map(c => ({
        id: oidRequired(c._id, 'Campaign._id'),
        tenantId: oidRequired(c.tenantId, 'Campaign.tenantId'),
        name: c.name,
        channel: c.channel,
        segment: c.segment,
        subject: c.subject ?? null,
        body: c.body,
        status: c.status ?? 'draft',
        sentCount: c.sentCount ?? 0,
        sentAt: c.sentAt ?? null,
        createdById: oid(c.createdBy),
        createdAt: c.createdAt ?? new Date(),
        updatedAt: c.updatedAt ?? new Date(),
      })),
    })
  );
}

async function migrateSubscriptions() {
  const subs = await Subscription.find().lean();

  await batchCreate('subscriptions', subs, batch =>
    prisma.subscription.createMany({
      skipDuplicates: true,
      data: batch.map(s => ({
        id: oidRequired(s._id, 'Subscription._id'),
        tenantId: oidRequired(s.tenantId, 'Subscription.tenantId'),
        planId: oidRequired(s.planId, 'Subscription.planId'),
        status: s.status ?? 'trial',
        billingCycle: s.billingCycle ?? 'monthly',
        startDate: s.startDate ?? new Date(),
        endDate: s.endDate ?? null,
        trialEndDate: s.trialEndDate ?? null,
        nextBillingDate: s.nextBillingDate ?? null,
        lastBillingDate: s.lastBillingDate ?? null,
        cancelledAt: s.cancelledAt ?? null,
        cancellationReason: s.cancellationReason ?? null,
        suspendedAt: s.suspendedAt ?? null,
        pausedAt: s.pausedAt ?? null,
        pauseReason: s.pauseReason ?? null,
        pauseEndsAt: s.pauseEndsAt ?? null,
        gracePeriodEndDate: s.gracePeriodEndDate ?? null,
        trialConvertedAt: s.trialConvertedAt ?? null,
        paymentOverdue: s.paymentOverdue ?? false,
        outstandingBalance: s.outstandingBalance ?? 0,
        lastInvoiceGeneratedAt: s.lastInvoiceGeneratedAt ?? null,
        lateFeeAppliedAt: s.lateFeeAppliedAt ?? null,
        reactivationFeeAppliedAt: s.reactivationFeeAppliedAt ?? null,
        deactivatedAt: s.deactivatedAt ?? null,
        paymentType: s.paymentMethod?.type ?? null,
        paymentLast4: s.paymentMethod?.last4 ?? null,
        paymentExpiryMonth: s.paymentMethod?.expiryMonth ?? null,
        paymentExpiryYear: s.paymentMethod?.expiryYear ?? null,
        paymentProvider: s.paymentMethod?.provider ?? null,
        usageCurrentUsers: s.usage?.currentUsers ?? 0,
        usageCurrentBranches: s.usage?.currentBranches ?? 1,
        usageCurrentProducts: s.usage?.currentProducts ?? 0,
        usageCurrentTransactions: s.usage?.currentTransactions ?? 0,
        usageLastResetDate: s.usage?.lastResetDate ?? new Date(),
        isTrial: s.isTrial ?? true,
        autoRenew: s.autoRenew ?? true,
        isActive: s.isActive ?? true,
        createdAt: s.createdAt ?? new Date(),
        updatedAt: s.updatedAt ?? new Date(),
      })),
    })
  );

  const billingHistoryRows = subs.flatMap(s =>
    ((s.billingHistory ?? []) as any[]).map((bh, idx) => ({ // eslint-disable-line @typescript-eslint/no-explicit-any
      id: bh._id ? String(bh._id) : `${String(s._id)}-bh-${idx}`,
      subscriptionId: oidRequired(s._id, 'Subscription._id'),
      date: bh.date,
      amount: bh.amount,
      currency: bh.currency ?? 'PHP',
      status: bh.status,
      transactionId: bh.transactionId ?? null,
      invoiceUrl: bh.invoiceUrl ?? null,
    }))
  );
  await batchCreate('subscription_billing_history', billingHistoryRows, batch =>
    prisma.subscriptionBillingHistory.createMany({ skipDuplicates: true, data: batch })
  );
}

async function migrateFeatureFlagOverrides() {
  const overrides = await FeatureFlagOverride.find().lean();
  await batchCreate('feature_flag_overrides', overrides, batch =>
    prisma.featureFlagOverride.createMany({
      skipDuplicates: true,
      data: batch.map(f => ({
        id: oidRequired(f._id, 'FeatureFlagOverride._id'),
        tenantId: oidRequired(f.tenantId, 'FeatureFlagOverride.tenantId'),
        feature: f.feature,
        enabled: f.enabled,
        reason: f.reason ?? null,
        expiresAt: f.expiresAt ?? null,
        grantedById: oidRequired(f.grantedBy, 'FeatureFlagOverride.grantedBy'),
        createdAt: f.createdAt ?? new Date(),
        updatedAt: f.updatedAt ?? new Date(),
      })),
    })
  );
}

// ── Operations ────────────────────────────────────────────────────────────

async function migrateCashDrawerSessions() {
  const sessions = await CashDrawerSession.find().lean();
  await batchCreate('cash_drawer_sessions', sessions, batch =>
    prisma.cashDrawerSession.createMany({
      skipDuplicates: true,
      data: batch.map(s => ({
        id: oidRequired(s._id, 'CashDrawerSession._id'),
        tenantId: oidRequired(s.tenantId, 'CashDrawerSession.tenantId'),
        userId: oidRequired(s.userId, 'CashDrawerSession.userId'),
        openingAmount: s.openingAmount,
        closingAmount: s.closingAmount ?? null,
        expectedAmount: s.expectedAmount ?? null,
        shortage: s.shortage ?? null,
        overage: s.overage ?? null,
        openingTime: s.openingTime ?? new Date(),
        closingTime: s.closingTime ?? null,
        status: s.status ?? 'open',
        notes: s.notes ?? null,
        totalVAT: s.totalVAT ?? 0,
        totalDiscounts: s.totalDiscounts ?? 0,
        createdAt: s.createdAt ?? new Date(),
        updatedAt: s.updatedAt ?? new Date(),
      })),
    })
  );
}

async function migrateDiscounts() {
  const discounts = await Discount.find().lean();
  await batchCreate('discounts', discounts, batch =>
    prisma.discount.createMany({
      skipDuplicates: true,
      data: batch.map(d => ({
        id: oidRequired(d._id, 'Discount._id'),
        tenantId: oidRequired(d.tenantId, 'Discount.tenantId'),
        code: d.code,
        name: d.name ?? null,
        description: d.description ?? null,
        type: d.type,
        value: d.value,
        category: d.category ?? 'general',
        requiresIdVerification: d.requiresIdVerification ?? false,
        minPurchaseAmount: d.minPurchaseAmount ?? null,
        maxDiscountAmount: d.maxDiscountAmount ?? null,
        validFrom: d.validFrom,
        validUntil: d.validUntil,
        usageLimit: d.usageLimit ?? null,
        usageCount: d.usageCount ?? 0,
        isActive: d.isActive ?? true,
        createdAt: d.createdAt ?? new Date(),
        updatedAt: d.updatedAt ?? new Date(),
      })),
    })
  );
}

async function migrateExpenses() {
  const expenses = await Expense.find().lean();
  await batchCreate('expenses', expenses, batch =>
    prisma.expense.createMany({
      skipDuplicates: true,
      data: batch.map(e => ({
        id: oidRequired(e._id, 'Expense._id'),
        tenantId: oidRequired(e.tenantId, 'Expense.tenantId'),
        name: e.name,
        description: e.description,
        amount: e.amount,
        date: e.date ?? new Date(),
        paymentMethod: e.paymentMethod,
        receipt: e.receipt ?? null,
        notes: e.notes ?? null,
        userId: oidRequired(e.userId, 'Expense.userId'),
        isActive: e.isActive ?? true,
        createdAt: e.createdAt ?? new Date(),
        updatedAt: e.updatedAt ?? new Date(),
      })),
    })
  );
}

async function migrateFiles() {
  const files = await FileModel.find().lean();
  await batchCreate('files', files, batch =>
    prisma.file.createMany({
      skipDuplicates: true,
      data: batch.map((f: any) => ({ // eslint-disable-line @typescript-eslint/no-explicit-any
        id: oidRequired(f._id, 'File._id'),
        tenantId: oidRequired(f.tenantId, 'File.tenantId'),
        name: f.name,
        filename: f.filename,
        size: f.size,
        type: f.type,
        url: f.url,
        uploadedById: oidRequired(f.uploadedBy, 'File.uploadedBy'),
        uploadedAt: f.uploadedAt ?? new Date(),
        createdAt: f.createdAt ?? new Date(),
        updatedAt: f.updatedAt ?? new Date(),
      })),
    })
  );
}

async function migrateInvoices() {
  const invoices = await Invoice.find().lean();

  await batchCreate('invoices', invoices, batch =>
    prisma.invoice.createMany({
      skipDuplicates: true,
      data: batch.map(i => ({
        id: oidRequired(i._id, 'Invoice._id'),
        tenantId: oidRequired(i.tenantId, 'Invoice.tenantId'),
        invoiceNumber: i.invoiceNumber,
        transactionId: oid(i.transactionId),
        customerId: oid(i.customerId),
        snapshotName: i.customerInfo?.name ?? null,
        snapshotEmail: i.customerInfo?.email ?? null,
        snapshotPhone: i.customerInfo?.phone ?? null,
        snapshotAddressStreet: i.customerInfo?.address?.street ?? null,
        snapshotAddressCity: i.customerInfo?.address?.city ?? null,
        snapshotAddressState: i.customerInfo?.address?.state ?? null,
        snapshotAddressZipCode: i.customerInfo?.address?.zipCode ?? null,
        snapshotAddressCountry: i.customerInfo?.address?.country ?? null,
        subtotal: i.subtotal,
        discountAmount: i.discountAmount ?? null,
        taxAmount: i.taxAmount ?? 0,
        total: i.total,
        dueDate: i.dueDate,
        paymentTerms: i.paymentTerms ?? null,
        status: i.status ?? 'draft',
        paidAt: i.paidAt ?? null,
        paidAmount: i.paidAmount ?? null,
        notes: i.notes ?? null,
        isActive: i.isActive ?? true,
        createdAt: i.createdAt ?? new Date(),
        updatedAt: i.updatedAt ?? new Date(),
      })),
    })
  );

  const itemRows = invoices.flatMap(i =>
    ((i.items ?? []) as any[]).map((it, idx) => ({ // eslint-disable-line @typescript-eslint/no-explicit-any
      id: it._id ? String(it._id) : `${String(i._id)}-item-${idx}`,
      invoiceId: oidRequired(i._id, 'Invoice._id'),
      name: it.name,
      description: it.description ?? null,
      quantity: it.quantity,
      price: it.price,
      subtotal: it.subtotal,
    }))
  );
  await batchCreate('invoice_items', itemRows, batch =>
    prisma.invoiceItem.createMany({ skipDuplicates: true, data: batch })
  );
}

async function migrateLoyaltyConfigs() {
  const configs = await LoyaltyConfig.find().lean();
  await batchCreate('loyalty_configs', configs, batch =>
    prisma.loyaltyConfig.createMany({
      skipDuplicates: true,
      data: batch.map((l: any) => ({ // eslint-disable-line @typescript-eslint/no-explicit-any
        tenantId: oidRequired(l.tenantId, 'LoyaltyConfig.tenantId'),
        pointsPerPeso: l.pointsPerPeso ?? 1,
        pesoPerPoint: l.pesoPerPoint ?? 0.1,
        minRedemption: l.minRedemption ?? 100,
        isEnabled: l.isEnabled ?? true,
        createdAt: l.createdAt ?? new Date(),
        updatedAt: l.updatedAt ?? new Date(),
      })),
    })
  );
}

async function migrateLoyaltyTransactions() {
  const txns = await LoyaltyTransaction.find().lean();
  await batchCreate('loyalty_transactions', txns, batch =>
    prisma.loyaltyTransaction.createMany({
      skipDuplicates: true,
      data: batch.map(t => ({
        id: oidRequired(t._id, 'LoyaltyTransaction._id'),
        tenantId: oidRequired(t.tenantId, 'LoyaltyTransaction.tenantId'),
        customerId: oidRequired(t.customerId, 'LoyaltyTransaction.customerId'),
        transactionId: oid(t.transactionId),
        type: t.type,
        points: t.points,
        balanceBefore: t.balanceBefore,
        balanceAfter: t.balanceAfter,
        description: t.description,
        createdById: oid(t.createdBy),
        createdAt: t.createdAt ?? new Date(),
        updatedAt: t.updatedAt ?? new Date(),
      })),
    })
  );
}

async function migrateOfflineTransactions() {
  const offline = await OfflineTransaction.find().lean();

  await batchCreate('offline_transactions', offline, batch =>
    prisma.offlineTransaction.createMany({
      skipDuplicates: true,
      data: batch.map(o => ({
        id: oidRequired(o._id, 'OfflineTransaction._id'),
        tenantId: oidRequired(o.tenantId, 'OfflineTransaction.tenantId'),
        branchId: oid(o.branchId),
        deviceId: o.deviceId,
        subtotal: o.subtotal,
        discountCode: o.discountCode ?? null,
        discountCategory: o.discountCategory ?? null,
        discountAmount: o.discountAmount ?? null,
        taxExemptAmount: o.taxExemptAmount ?? 0,
        taxAmount: o.taxAmount ?? 0,
        total: o.total,
        paymentMethod: o.paymentMethod,
        cashReceived: o.cashReceived ?? null,
        change: o.change ?? null,
        customerId: oid(o.customerId),
        userId: oid(o.userId),
        notes: o.notes ?? null,
        offlineCreatedAt: o.offlineCreatedAt ?? new Date(),
        syncStatus: o.syncStatus ?? 'pending',
        syncedTransactionId: oid(o.syncedTransactionId),
        retryCount: o.retryCount ?? 0,
        syncError: o.syncError ?? null,
        isActive: o.isActive ?? true,
        createdAt: o.createdAt ?? new Date(),
        updatedAt: o.updatedAt ?? new Date(),
      })),
    })
  );

  const itemRows = offline.flatMap(o =>
    ((o.items ?? []) as any[]).map((it, idx) => ({ // eslint-disable-line @typescript-eslint/no-explicit-any
      id: it._id ? String(it._id) : `${String(o._id)}-item-${idx}`,
      offlineTransactionId: oidRequired(o._id, 'OfflineTransaction._id'),
      productId: oid(it.productId),
      name: it.name,
      price: it.price,
      quantity: it.quantity,
      subtotal: it.subtotal,
    }))
  );
  await batchCreate('offline_transaction_items', itemRows, batch =>
    prisma.offlineTransactionItem.createMany({ skipDuplicates: true, data: batch })
  );
}

async function migratePayments() {
  const payments = await Payment.find().lean();
  await batchCreate('payments', payments, batch =>
    prisma.payment.createMany({
      skipDuplicates: true,
      data: batch.map(p => ({
        id: oidRequired(p._id, 'Payment._id'),
        tenantId: oidRequired(p.tenantId, 'Payment.tenantId'),
        transactionId: oidRequired(p.transactionId, 'Payment.transactionId'),
        method: p.method,
        amount: p.amount,
        status: p.status ?? 'pending',
        detailsCardLast4: p.details?.cardLast4 ?? null,
        detailsCardType: p.details?.cardType ?? null,
        detailsCardBrand: p.details?.cardBrand ?? null,
        detailsGatewayTxnId: p.details?.transactionId ?? null,
        detailsProvider: p.details?.provider ?? null,
        detailsCashReceived: p.details?.cashReceived ?? null,
        detailsChange: p.details?.change ?? null,
        detailsCheckNumber: p.details?.checkNumber ?? null,
        detailsNotes: p.details?.notes ?? null,
        processedById: oid(p.processedBy),
        processedAt: p.processedAt ?? null,
        refundedAt: p.refundedAt ?? null,
        refundReason: p.refundReason ?? null,
        isActive: p.isActive ?? true,
        createdAt: p.createdAt ?? new Date(),
        updatedAt: p.updatedAt ?? new Date(),
      })),
    })
  );
}

async function migratePrescriptions() {
  const prescriptions = await Prescription.find().lean();

  await batchCreate('prescriptions', prescriptions, batch =>
    prisma.prescription.createMany({
      skipDuplicates: true,
      data: batch.map(p => ({
        id: oidRequired(p._id, 'Prescription._id'),
        tenantId: oidRequired(p.tenantId, 'Prescription.tenantId'),
        prescriptionNumber: p.prescriptionNumber,
        patientName: p.patientName,
        patientAge: p.patientAge ?? null,
        doctorName: p.doctorName,
        doctorPRCNumber: p.doctorPRCNumber,
        doctorClinic: p.doctorClinic ?? null,
        issuedDate: p.issuedDate,
        validUntil: p.validUntil,
        transactionId: oid(p.transactionId),
        status: p.status ?? 'pending',
        notes: p.notes ?? null,
        scannedCopy: p.scannedCopy ?? null,
        createdById: oidRequired(p.createdBy, 'Prescription.createdBy'),
        createdAt: p.createdAt ?? new Date(),
        updatedAt: p.updatedAt ?? new Date(),
      })),
    })
  );

  const itemRows = prescriptions.flatMap(p =>
    ((p.items ?? []) as any[]).map((it, idx) => ({ // eslint-disable-line @typescript-eslint/no-explicit-any
      id: it._id ? String(it._id) : `${String(p._id)}-item-${idx}`,
      prescriptionId: oidRequired(p._id, 'Prescription._id'),
      productId: oid(it.productId),
      drugName: it.drugName,
      quantity: it.quantity,
      dosage: it.dosage,
      frequency: it.frequency,
      instructions: it.instructions ?? null,
      dispensed: it.dispensed ?? false,
      dispensedAt: it.dispensedAt ?? null,
      dispensedById: oid(it.dispensedBy),
      dispensedTransactionId: oid(it.dispensedTransactionId),
    }))
  );
  await batchCreate('prescription_items', itemRows, batch =>
    prisma.prescriptionItem.createMany({ skipDuplicates: true, data: batch })
  );
}

async function migrateRecurringBookingTemplates() {
  const templates = await RecurringBookingTemplate.find().lean();
  await batchCreate('recurring_booking_templates', templates, batch =>
    prisma.recurringBookingTemplate.createMany({
      skipDuplicates: true,
      data: batch.map(t => ({
        id: oidRequired(t._id, 'RecurringBookingTemplate._id'),
        tenantId: oidRequired(t.tenantId, 'RecurringBookingTemplate.tenantId'),
        customerName: t.customerName,
        customerEmail: t.customerEmail ?? null,
        customerPhone: t.customerPhone ?? null,
        serviceName: t.serviceName,
        serviceDescription: t.serviceDescription ?? null,
        staffId: oid(t.staffId),
        staffName: t.staffName ?? null,
        duration: t.duration,
        startTimeHour: t.startTimeHour,
        startTimeMinute: t.startTimeMinute,
        recurrenceType: t.recurrenceType,
        daysOfWeek: t.daysOfWeek ?? [],
        dayOfMonth: t.dayOfMonth ?? null,
        effectiveFrom: t.effectiveFrom,
        effectiveTo: t.effectiveTo ?? null,
        notes: t.notes ?? null,
        isActive: t.isActive ?? true,
        createdAt: t.createdAt ?? new Date(),
        updatedAt: t.updatedAt ?? new Date(),
      })),
    })
  );
}

async function migrateSavedCarts() {
  const carts = await SavedCart.find().lean();

  await batchCreate('saved_carts', carts, batch =>
    prisma.savedCart.createMany({
      skipDuplicates: true,
      data: batch.map(c => ({
        id: oidRequired(c._id, 'SavedCart._id'),
        tenantId: oidRequired(c.tenantId, 'SavedCart.tenantId'),
        name: c.name ?? 'Saved Cart',
        subtotal: c.subtotal,
        discountCode: c.discountCode ?? null,
        discountAmount: c.discountAmount ?? null,
        total: c.total,
        userId: oidRequired(c.userId, 'SavedCart.userId'),
        isActive: c.isActive ?? true,
        createdAt: c.createdAt ?? new Date(),
        updatedAt: c.updatedAt ?? new Date(),
      })),
    })
  );

  const itemRows = carts.flatMap(c =>
    ((c.items ?? []) as any[]).map((it, idx) => ({ // eslint-disable-line @typescript-eslint/no-explicit-any
      id: it._id ? String(it._id) : `${String(c._id)}-item-${idx}`,
      savedCartId: oidRequired(c._id, 'SavedCart._id'),
      productId: oidRequired(it.productId, 'SavedCart.items[].productId'),
      name: it.name,
      price: it.price,
      quantity: it.quantity,
      stock: it.stock,
    }))
  );
  await batchCreate('saved_cart_items', itemRows, batch =>
    prisma.savedCartItem.createMany({ skipDuplicates: true, data: batch })
  );
}

async function migrateStockMovements() {
  const allMovements = await StockMovement.find().lean();
  const existingProductIds = new Set(
    (await prisma.product.findMany({ select: { id: true } })).map((p) => p.id)
  );
  const movements = allMovements.filter((m: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
    if (!existingProductIds.has(String(m.productId))) {
      log(`  SKIPPED StockMovement ${m._id}: references product ${m.productId} which no longer exists (deleted product, orphaned history record)`);
      return false;
    }
    return true;
  });
  await batchCreate('stock_movements', movements, batch =>
    prisma.stockMovement.createMany({
      skipDuplicates: true,
      data: batch.map(m => ({
        id: oidRequired(m._id, 'StockMovement._id'),
        productId: oidRequired(m.productId, 'StockMovement.productId'),
        tenantId: oidRequired(m.tenantId, 'StockMovement.tenantId'),
        branchId: oid(m.branchId),
        variationSize: m.variation?.size ?? null,
        variationColor: m.variation?.color ?? null,
        variationType: m.variation?.type ?? null,
        type: m.type,
        quantity: clampInt32(m.quantity, 'StockMovement.quantity', String(m._id)),
        previousStock: clampInt32(m.previousStock, 'StockMovement.previousStock', String(m._id)),
        newStock: clampInt32(m.newStock, 'StockMovement.newStock', String(m._id)),
        reason: m.reason ?? null,
        transactionId: oid(m.transactionId),
        userId: oid(m.userId),
        notes: m.notes ?? null,
        createdAt: m.createdAt ?? new Date(),
      })),
    })
  );
}

async function migrateTaxRules() {
  const rules = await TaxRule.find().lean();

  await batchCreate('tax_rules (standalone TaxRule collection)', rules, batch =>
    prisma.taxRule.createMany({
      skipDuplicates: true,
      data: batch.map(r => ({
        id: oidRequired(r._id, 'TaxRule._id'),
        tenantId: oidRequired(r.tenantId, 'TaxRule.tenantId'),
        name: r.name,
        rate: r.rate,
        label: r.label ?? 'Tax',
        appliesTo: r.appliesTo ?? 'all',
        regionCountry: r.region?.country ?? null,
        regionState: r.region?.state ?? null,
        regionCity: r.region?.city ?? null,
        regionZipCodes: r.region?.zipCodes ?? [],
        priority: r.priority ?? 0,
        isActive: r.isActive ?? true,
        createdAt: r.createdAt ?? new Date(),
        updatedAt: r.updatedAt ?? new Date(),
      })),
    })
  );

  const categoryJoinRows = rules.flatMap(r =>
    ((r.categoryIds ?? []) as unknown[]).map(cid => ({
      taxRuleId: oidRequired(r._id, 'TaxRule._id'),
      categoryId: oidRequired(cid, 'TaxRule.categoryIds[]'),
    }))
  );
  await batchCreate('tax_rule_categories', categoryJoinRows, batch =>
    prisma.taxRuleCategory.createMany({ skipDuplicates: true, data: batch })
  );

  const productJoinRows = rules.flatMap(r =>
    ((r.productIds ?? []) as unknown[]).map(pid => ({
      taxRuleId: oidRequired(r._id, 'TaxRule._id'),
      productId: oidRequired(pid, 'TaxRule.productIds[]'),
    }))
  );
  await batchCreate('tax_rule_products', productJoinRows, batch =>
    prisma.taxRuleProduct.createMany({ skipDuplicates: true, data: batch })
  );
}

async function migratePosTables() {
  const tables = await PosTable.find().lean();
  await batchCreate('pos_tables', tables, batch =>
    prisma.posTable.createMany({
      skipDuplicates: true,
      data: batch.map(t => ({
        id: oidRequired(t._id, 'Table._id'),
        tenantId: oidRequired(t.tenantId, 'Table.tenantId'),
        branchId: oid(t.branchId),
        name: t.name,
        capacity: t.capacity ?? null,
        status: mapEnumValue(t.status ?? 'open', TABLE_STATUS_MAP),
        currentOrderId: oid(t.currentOrderId),
        isActive: t.isActive ?? true,
        createdAt: t.createdAt ?? new Date(),
        updatedAt: t.updatedAt ?? new Date(),
      })),
    })
  );
}

async function migrateZReadings() {
  const readings = await ZReading.find().lean();
  await batchCreate('z_readings', readings, batch =>
    prisma.zReading.createMany({
      skipDuplicates: true,
      data: batch.map(z => ({
        id: oidRequired(z._id, 'ZReading._id'),
        tenantId: oidRequired(z.tenantId, 'ZReading.tenantId'),
        branchId: oid(z.branchId),
        businessDate: z.businessDate,
        beginningGT: z.beginningGT,
        endingGT: z.endingGT,
        grossSales: z.grossSales,
        vatableSales: z.vatableSales ?? 0,
        vatAmount: z.vatAmount ?? 0,
        vatExemptSales: z.vatExemptSales ?? 0,
        zeroRatedSales: z.zeroRatedSales ?? 0,
        discountTotal: z.discountTotal ?? 0,
        transactionCount: z.transactionCount ?? 0,
        voidCount: z.voidCount ?? 0,
        generatedById: oidRequired(z.generatedBy, 'ZReading.generatedBy'),
        generatedAt: z.generatedAt ?? new Date(),
        createdAt: z.createdAt ?? new Date(),
        updatedAt: z.updatedAt ?? new Date(),
      })),
    })
  );
}

// ── Attendance & bookings ────────────────────────────────────────────────

async function migrateAttendance() {
  const records = await Attendance.find().lean();
  await batchCreate('attendances', records, batch =>
    prisma.attendance.createMany({
      skipDuplicates: true,
      data: batch.map(a => ({
        id: oidRequired(a._id, 'Attendance._id'),
        userId: oidRequired(a.userId, 'Attendance.userId'),
        tenantId: oidRequired(a.tenantId, 'Attendance.tenantId'),
        clockIn: a.clockIn,
        clockOut: a.clockOut ?? null,
        breakStart: a.breakStart ?? null,
        breakEnd: a.breakEnd ?? null,
        totalHours: a.totalHours ?? null,
        notes: a.notes ?? null,
        locationLatitude: a.location?.latitude ?? null,
        locationLongitude: a.location?.longitude ?? null,
        locationAddress: a.location?.address ?? null,
        isActive: a.isActive ?? true,
        createdAt: a.createdAt ?? new Date(),
        updatedAt: a.updatedAt ?? new Date(),
      })),
    })
  );
}

async function migrateBookings() {
  const bookings = await Booking.find().lean();
  await batchCreate('bookings', bookings, batch =>
    prisma.booking.createMany({
      skipDuplicates: true,
      data: batch.map(b => ({
        id: oidRequired(b._id, 'Booking._id'),
        tenantId: oidRequired(b.tenantId, 'Booking.tenantId'),
        customerName: b.customerName,
        customerEmail: b.customerEmail ?? null,
        customerPhone: b.customerPhone ?? null,
        serviceName: b.serviceName,
        serviceDescription: b.serviceDescription ?? null,
        startTime: b.startTime,
        endTime: b.endTime,
        duration: b.duration,
        status: mapEnumValue(b.status ?? 'pending', BOOKING_STATUS_MAP),
        staffId: oid(b.staffId),
        staffName: b.staffName ?? null,
        notes: b.notes ?? null,
        reminderSent: b.reminderSent ?? false,
        confirmationSent: b.confirmationSent ?? false,
        isActive: b.isActive ?? true,
        createdAt: b.createdAt ?? new Date(),
        updatedAt: b.updatedAt ?? new Date(),
      })),
    })
  );
}

// ── Transactions (core POS sale record) ─────────────────────────────────

async function migrateTransactions() {
  const allTransactions = await Transaction.find().lean();
  const transactions = allTransactions.filter((t) => {
    if (!oid(t.tenantId)) {
      log(`  SKIPPED Transaction ${t._id}: no tenantId (orphaned record, not migrated)`);
      return false;
    }
    return true;
  });

  await batchCreate('transactions', transactions, batch =>
    prisma.transaction.createMany({
      skipDuplicates: true,
      data: batch.map(t => ({
        id: oidRequired(t._id, 'Transaction._id'),
        tenantId: oidRequired(t.tenantId, 'Transaction.tenantId'),
        branchId: oid(t.branchId),
        subtotal: t.subtotal,
        discountCode: t.discountCode ?? null,
        discountCategory: t.discountCategory ?? null,
        discountAmount: t.discountAmount ?? null,
        scPwdName: t.scPwdName ?? null,
        scPwdId: t.scPwdId ?? null,
        taxExemptAmount: t.taxExemptAmount ?? 0,
        zeroRatedAmount: t.zeroRatedAmount ?? 0,
        taxAmount: t.taxAmount ?? 0,
        total: t.total,
        paymentMethod: t.paymentMethod,
        paymentProvider: t.paymentProvider ?? null,
        paymentReference: t.paymentReference ?? null,
        bnplInstallments: t.bnplInstallments ?? null,
        cashReceived: t.cashReceived ?? null,
        change: t.change ?? null,
        status: t.status ?? 'completed',
        customerId: oid(t.customerId),
        loyaltyPointsEarned: t.loyaltyPointsEarned ?? null,
        loyaltyPointsRedeemed: t.loyaltyPointsRedeemed ?? null,
        userId: oid(t.userId),
        deviceId: oid(t.deviceId),
        terminalId: t.terminalId ?? null,
        deviceSerialNumber: t.deviceSerialNumber ?? null,
        receiptNumber: t.receiptNumber ?? null,
        idempotencyKey: t.idempotencyKey ?? null,
        notes: t.notes ?? null,
        displayCurrency: t.displayCurrency ?? null,
        displayTotal: t.displayTotal ?? null,
        orderType: mapEnumValue(t.orderType ?? null, ORDER_TYPE_MAP),
        tableNumber: t.tableNumber ?? null,
        tableId: oid(t.tableId),
        splitCount: t.splitCount ?? null,
        salesChannel: t.salesChannel ?? null,
        externalOrderId: t.externalOrderId ?? null,
        channelSyncKey: t.channelSyncKey ?? null,
        channelImportedAt: t.channelImportedAt ?? null,
        shopifyFulfilledAt: t.shopifyFulfilledAt ?? null,
        shopifyFulfillmentId: t.shopifyFulfillmentId ?? null,
        isActive: t.isActive ?? true,
        createdAt: t.createdAt ?? new Date(),
        updatedAt: t.updatedAt ?? new Date(),
      })),
    })
  );

  const existingProductIds = new Set(
    (await prisma.product.findMany({ select: { id: true } })).map((p) => p.id)
  );

  const itemRows: any[] = []; // eslint-disable-line @typescript-eslint/no-explicit-any
  const modifierRows: any[] = []; // eslint-disable-line @typescript-eslint/no-explicit-any
  for (const t of transactions) {
    ((t.items ?? []) as any[]).forEach((it, idx) => { // eslint-disable-line @typescript-eslint/no-explicit-any
      const itemId = it._id ? String(it._id) : `${String(t._id)}-item-${idx}`;
      const rawProductId = oid(it.product);
      const productId = rawProductId && existingProductIds.has(rawProductId) ? rawProductId : null;
      if (rawProductId && !productId) {
        log(`  WARN: TransactionItem ${itemId} references product ${rawProductId} which no longer exists — productId cleared, line item still migrated`);
      }
      itemRows.push({
        id: itemId,
        transactionId: oidRequired(t._id, 'Transaction._id'),
        productId,
        variationId: null, // Mongo TransactionItem has no variation ref field; left null (see report)
        name: it.name,
        price: it.price,
        quantity: it.quantity,
        subtotal: it.subtotal,
        prescriptionId: oid(it.prescriptionId),
      });
      ((it.modifiers ?? []) as any[]).forEach((mod, mIdx) => { // eslint-disable-line @typescript-eslint/no-explicit-any
        modifierRows.push({
          id: mod._id ? String(mod._id) : `${itemId}-mod-${mIdx}`,
          transactionItemId: itemId,
          name: mod.name,
          chosenOption: mod.chosenOption,
          price: mod.price ?? 0,
        });
      });
    });
  }
  await batchCreate('transaction_items', itemRows, batch =>
    prisma.transactionItem.createMany({ skipDuplicates: true, data: batch })
  );
  await batchCreate('transaction_item_modifiers', modifierRows, batch =>
    prisma.transactionItemModifier.createMany({ skipDuplicates: true, data: batch })
  );

  const splitPaymentRows = transactions.flatMap(t =>
    ((t.splitPayments ?? []) as any[]).map((sp, idx) => ({ // eslint-disable-line @typescript-eslint/no-explicit-any
      id: sp._id ? String(sp._id) : `${String(t._id)}-split-${idx}`,
      transactionId: oidRequired(t._id, 'Transaction._id'),
      guestIndex: sp.guestIndex,
      method: sp.method,
      amount: sp.amount,
      reference: sp.reference ?? null,
    }))
  );
  await batchCreate('transaction_split_payments', splitPaymentRows, batch =>
    prisma.transactionSplitPayment.createMany({ skipDuplicates: true, data: batch })
  );
}

// ── Audit logs / super-admin / billing (migrated last — reference many entities) ──

async function migrateAuditLogs() {
  const logs = await AuditLog.find().lean();
  await batchCreate('audit_logs', logs, batch =>
    prisma.auditLog.createMany({
      skipDuplicates: true,
      data: batch.map(l => ({
        id: oidRequired(l._id, 'AuditLog._id'),
        tenantId: oidRequired(l.tenantId, 'AuditLog.tenantId'),
        userId: oid(l.userId),
        action: l.action,
        entityType: l.entityType,
        entityId: l.entityId ?? null,
        changes: l.changes ? (toJsonSafe(l.changes) as object) : undefined,
        ipAddress: l.ipAddress ?? null,
        userAgent: l.userAgent ?? null,
        metadata: l.metadata ? (toJsonSafe(l.metadata) as object) : undefined,
        createdAt: l.createdAt ?? new Date(),
      })),
    })
  );
}

async function migrateArchivedAuditLogs() {
  const logs = await ArchivedAuditLog.find().lean();
  await batchCreate('archived_audit_logs', logs, batch =>
    prisma.archivedAuditLog.createMany({
      skipDuplicates: true,
      data: batch.map(l => ({
        id: oidRequired(l._id, 'ArchivedAuditLog._id'),
        tenantId: oidRequired(l.tenantId, 'ArchivedAuditLog.tenantId'),
        userId: oid(l.userId),
        action: l.action,
        entityType: l.entityType,
        entityId: l.entityId ?? null,
        changes: l.changes ? (toJsonSafe(l.changes) as object) : undefined,
        ipAddress: l.ipAddress ?? null,
        userAgent: l.userAgent ?? null,
        metadata: l.metadata ? (toJsonSafe(l.metadata) as object) : undefined,
        archivedAt: l.archivedAt ?? new Date(),
        createdAt: l.createdAt ?? new Date(),
      })),
    })
  );
}

async function migrateSuperAdminActions() {
  const actions = await SuperAdminAction.find().lean();
  await batchCreate('super_admin_actions', actions, batch =>
    prisma.superAdminAction.createMany({
      skipDuplicates: true,
      data: batch.map(a => ({
        id: oidRequired(a._id, 'SuperAdminAction._id'),
        adminUserId: oidRequired(a.adminUserId, 'SuperAdminAction.adminUserId'),
        action: a.action,
        targetType: a.targetType ?? null,
        targetId: a.targetId ?? null,
        description: a.description ?? null,
        changes: a.changes ? (toJsonSafe(a.changes) as object) : undefined,
        ipAddress: a.ipAddress ?? null,
        userAgent: a.userAgent ?? null,
        metadata: a.metadata ? (toJsonSafe(a.metadata) as object) : undefined,
        createdAt: a.createdAt ?? new Date(),
      })),
    })
  );
}

async function migrateBillingEvents() {
  const events = await BillingEvent.find().lean();
  await batchCreate('billing_events', events, batch =>
    prisma.billingEvent.createMany({
      skipDuplicates: true,
      data: batch.map(e => ({
        id: oidRequired(e._id, 'BillingEvent._id'),
        tenantId: oidRequired(e.tenantId, 'BillingEvent.tenantId'),
        subscriptionId: oidRequired(e.subscriptionId, 'BillingEvent.subscriptionId'),
        type: e.type,
        amount: e.amount,
        currency: e.currency ?? 'PHP',
        description: e.description ?? null,
        notes: e.notes ?? null,
        transactionId: e.transactionId ?? null,
        invoiceUrl: e.invoiceUrl ?? null,
        recordedById: oid(e.recordedBy),
        metadata: e.metadata ? (toJsonSafe(e.metadata) as object) : undefined,
        createdAt: e.createdAt ?? new Date(),
        updatedAt: e.updatedAt ?? new Date(),
      })),
    })
  );
}

// ── Main ─────────────────────────────────────────────────────────────────

async function main() {
  console.log('1POS — MongoDB -> PostgreSQL ETL');
  console.log(DRY_RUN ? '(dry-run: reading Mongo only, writing nothing)' : '(live run: writing to Postgres)');
  if (ONLY) console.log(`(--only=${ONLY})`);

  console.log('\nConnecting to MongoDB...');
  await connectDB();
  console.log('Connected.');

  // FK-dependency order, per the migration plan:
  // 1. Tenant/SubscriptionPlan (+ Tenant settings cluster)
  await runStep('SubscriptionPlan', migrateSubscriptionPlans);
  await runStep('Coupon', migrateCouponsAndPlans);
  await runStep('Tenant', migrateTenants);

  // 2. Branch/User (+ Address, Device)
  await runStep('Branch', migrateBranches);
  await runStep('User', migrateUsers);
  await runStep('Address', migrateAddresses);
  await runStep('Device', migrateDevices);

  // 3. Product and child tables
  await runStep('Category', migrateCategories);
  await runStep('Product', migrateProducts);
  await runStep('ProductBundle', migrateProductBundles);
  await runStep('ProductChannelListing', migrateProductChannelListings);
  await runStep('TenantEcommerceIntegration', migrateTenantEcommerceIntegrations);

  // 4. Customers
  await runStep('Customer', migrateCustomers);
  await runStep('CustomerOTP', migrateCustomerOTPs);
  await runStep('CustomerBalancePayment', migrateCustomerBalancePayments);

  // 5. Marketing / subscriptions
  await runStep('Campaign', migrateCampaigns);
  await runStep('Subscription', migrateSubscriptions);
  await runStep('FeatureFlagOverride', migrateFeatureFlagOverrides);

  // 6. Operations
  // Transaction moved ahead of Payment/StockMovement/BillingEvent (all reference
  // transactionId via FK) — the original migration's Payment/StockMovement/Operations
  // step ran before Transaction, which only worked because no Payment/StockMovement/
  // BillingEvent row referenced a transactionId at that time. New Mongo data does.
  await runStep('Transaction', migrateTransactions);

  await runStep('CashDrawerSession', migrateCashDrawerSessions);
  await runStep('Discount', migrateDiscounts);
  await runStep('Expense', migrateExpenses);
  await runStep('File', migrateFiles);
  await runStep('Invoice', migrateInvoices);
  await runStep('LoyaltyConfig', migrateLoyaltyConfigs);
  await runStep('LoyaltyTransaction', migrateLoyaltyTransactions);
  await runStep('OfflineTransaction', migrateOfflineTransactions);
  await runStep('Payment', migratePayments);
  await runStep('Prescription', migratePrescriptions);
  await runStep('RecurringBookingTemplate', migrateRecurringBookingTemplates);
  await runStep('SavedCart', migrateSavedCarts);
  await runStep('StockMovement', migrateStockMovements);
  await runStep('TaxRule', migrateTaxRules);
  await runStep('Table', migratePosTables);
  await runStep('ZReading', migrateZReadings);
  await runStep('Attendance', migrateAttendance);
  await runStep('Booking', migrateBookings);

  // 8. Audit logs / super-admin / billing — last, they reference many entities
  await runStep('AuditLog', migrateAuditLogs);
  await runStep('ArchivedAuditLog', migrateArchivedAuditLogs);
  await runStep('SuperAdminAction', migrateSuperAdminActions);
  await runStep('BillingEvent', migrateBillingEvents);

  console.log('\n=== Summary ===');
  if (!DRY_RUN) {
    console.log(`Inserted: ${insertCount}, Updated: ${upsertCount}`);
  }
  if (failures.length === 0) {
    console.log(DRY_RUN ? 'Dry-run completed with no errors.' : 'Sync completed with no errors.');
  } else {
    console.log(`Completed with ${failures.length} failure(s):`);
    for (const f of failures) {
      console.log(`  - ${f.entity}: ${f.error}`);
    }
  }
}

main()
  .catch(err => {
    console.error('\nFatal error:', err);
    failures.push({ entity: 'fatal', error: err instanceof Error ? err.message : String(err) });
  })
  .finally(async () => {
    await mongoose.disconnect().catch(() => null);
    await prisma.$disconnect().catch(() => null);
    process.exit(failures.length > 0 ? 1 : 0);
  });
