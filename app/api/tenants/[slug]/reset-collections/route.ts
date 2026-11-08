import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Tenant from '@/models/Tenant';
import { requireAuth } from '@/lib/auth';
import { hasTenantPermission } from '@/lib/permissions-server';
import { createAuditLog, AuditActions } from '@/lib/audit';
import Product from '@/models/Product';
import Transaction from '@/models/Transaction';
import Category from '@/models/Category';
import StockMovement from '@/models/StockMovement';
import Expense from '@/models/Expense';
import Discount from '@/models/Discount';
import Branch from '@/models/Branch';
import CashDrawerSession from '@/models/CashDrawerSession';
import ProductBundle from '@/models/ProductBundle';
import Attendance from '@/models/Attendance';
import Booking from '@/models/Booking';
import SavedCart from '@/models/SavedCart';
import AuditLog from '@/models/AuditLog';
import Customer from '@/models/Customer';
import Address from '@/models/Address';
import Invoice from '@/models/Invoice';
import Payment from '@/models/Payment';
import LoyaltyConfig from '@/models/LoyaltyConfig';
import LoyaltyTransaction from '@/models/LoyaltyTransaction';
import TaxRule from '@/models/TaxRule';
import CustomerOTP from '@/models/CustomerOTP';
import User from '@/models/User';
import Device from '@/models/Device';
import Table from '@/models/Table';
import mongoose from 'mongoose';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { logger } from '@/lib/logger';
import { runWithOptionalMongoTransaction, sessionOpts } from '@/lib/mongo-session';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import {
  MAX_RESTORE_BYTES, checkRestoreSize, filterByReferences, ownId, unresolvedReferences,
} from '@/lib/restore-references';

/** Backups, resets and restores are heavy and destructive: a few per minute per user is plenty. */
function rateLimited(request: NextRequest, kind: string, userId: string) {
  const { allowed } = checkRateLimit(`write:collections-${kind}:${userId}:${getClientIp(request)}`, 5, 60_000);
  return allowed ? null : NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429 });
}

// Map collection names to their models
const COLLECTION_MODELS: Record<string, any> = { // eslint-disable-line @typescript-eslint/no-explicit-any
  // Products & Inventory
  products: Product,
  productBundles: ProductBundle,
  categories: Category,
  stockMovements: StockMovement,
  // Sales & Transactions
  transactions: Transaction,
  payments: Payment,
  invoices: Invoice,
  // Customer Management
  customers: Customer,
  addresses: Address,
  customerOTPs: CustomerOTP,
  // Discounts & Promotions
  discounts: Discount,
  savedCarts: SavedCart,
  // Loyalty Program
  loyaltyConfigs: LoyaltyConfig,
  loyaltyTransactions: LoyaltyTransaction,
  // Tax & Compliance
  taxRules: TaxRule,
  // Organizational
  branches: Branch,
  expenses: Expense,
  // Cash Management
  cashDrawerSessions: CashDrawerSession,
  // Staff & Operations
  attendance: Attendance,
  // Bookings & Services
  bookings: Booking,
  // Audit & Compliance
  auditLogs: AuditLog,
};

/**
 * Collections that can be backed up but never cleared or restored: clearing the audit
 * trail would hide what happened, and restoring it would let a file add made-up entries.
 */
const BACKUP_ONLY = new Set(['auditLogs']);

/** Models a restored record may point at besides the file itself, looked up in this store only. */
const REFERENCE_MODELS: any[] = [ // eslint-disable-line @typescript-eslint/no-explicit-any
  ...Object.entries(COLLECTION_MODELS).filter(([k]) => !BACKUP_ONLY.has(k)).map(([, m]) => m),
  User, Device, Table,
];

// Backup endpoint - GET
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    await connectDB();
    const user = await requireAuth(request);
    const limited = rateLimited(request, 'backup', user.userId);
    if (limited) return limited;
    const { slug } = await params;
    const t = await getValidationTranslatorFromRequest(request);
    
    const tenant = await Tenant.findOne({ slug, isActive: true });
    if (!tenant) {
      return NextResponse.json(
        { success: false, error: t('validation.tenantNotFound', 'Tenant not found') },
        { status: 404 }
      );
    }

    // Verify user owns this tenant (unless super_admin)
    if (user.role !== 'super_admin' && user.tenantId !== tenant._id.toString()) {
      return NextResponse.json(
        { success: false, error: t('validation.forbidden', 'You do not have access to this tenant') },
        { status: 403 }
      );
    }

    if (!(await hasTenantPermission(user.role, tenant._id.toString(), 'reset_collections.manage'))) {
      return NextResponse.json(
        { success: false, error: t('validation.forbidden', 'Forbidden: Insufficient permissions') },
        { status: 403 }
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const collectionsParam = searchParams.get('collections');
    const collections = collectionsParam ? collectionsParam.split(',') : Object.keys(COLLECTION_MODELS);

    // Validate collection names
    const invalidCollections = collections.filter(
      (col: string) => !COLLECTION_MODELS[col]
    );
    if (invalidCollections.length > 0) {
      return NextResponse.json(
        { success: false, error: `Invalid collections: ${invalidCollections.join(', ')}` },
        { status: 400 }
      );
    }

    const backup: Record<string, any[]> = {}; // eslint-disable-line @typescript-eslint/no-explicit-any
    const counts: Record<string, number> = {};

    // Export data from each collection
    for (const collectionName of collections) {
      const Model = COLLECTION_MODELS[collectionName];
      const documents = await Model.find({ tenantId: tenant._id }).lean();
      backup[collectionName] = documents;
      counts[collectionName] = documents.length;
    }

    const backupData = {
      version: '1.0',
      tenantSlug: slug,
      tenantName: tenant.name,
      createdAt: new Date().toISOString(),
      collections: backup,
      counts,
    };

    // Create audit log
    await createAuditLog(request, {
      tenantId: tenant._id,
      userId: user.userId,
      action: AuditActions.VIEW,
      entityType: 'collections',
      entityId: 'backup',
      changes: {
        collections: collections,
        counts: counts,
      },
    });

    // Return as JSON with download headers
    return new NextResponse(JSON.stringify(backupData, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="backup-${slug}-${new Date().toISOString().split('T')[0]}.json"`,
      },
    });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    if (error.message === 'Unauthorized' || error.message.includes('Forbidden')) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.message === 'Unauthorized' ? 401 : 403 }
      );
    }
    logger.error('Error creating backup:', error);
    const t = await getValidationTranslatorFromRequest(request);
    return NextResponse.json(
      { success: false, error: error.message || t('validation.failedToCreateBackup', 'Failed to create backup') },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    await connectDB();
    const user = await requireAuth(request);
    const limited = rateLimited(request, 'reset', user.userId);
    if (limited) return limited;
    const { slug } = await params;
    
    const tenant = await Tenant.findOne({ slug, isActive: true });
    const t = await getValidationTranslatorFromRequest(request);
    if (!tenant) {
      return NextResponse.json(
        { success: false, error: t('validation.tenantNotFound', 'Tenant not found') },
        { status: 404 }
      );
    }

    // Verify user owns this tenant (unless super_admin)
    if (user.role !== 'super_admin' && user.tenantId !== tenant._id.toString()) {
      return NextResponse.json(
        { success: false, error: t('validation.forbidden', 'You do not have access to this tenant') },
        { status: 403 }
      );
    }

    if (!(await hasTenantPermission(user.role, tenant._id.toString(), 'reset_collections.manage'))) {
      return NextResponse.json(
        { success: false, error: t('validation.forbidden', 'Forbidden: Insufficient permissions') },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { collections } = body;

    if (!Array.isArray(collections) || collections.length === 0) {
      return NextResponse.json(
        { success: false, error: t('validation.collectionsArrayRequired', 'Collections array is required') },
        { status: 400 }
      );
    }

    // Validate collection names; backup-only ones (audit logs) can never be cleared.
    const invalidCollections = collections.filter(
      (col: string) => !COLLECTION_MODELS[col] || BACKUP_ONLY.has(col)
    );
    if (invalidCollections.length > 0) {
      return NextResponse.json(
        { success: false, error: `Invalid collections: ${invalidCollections.join(', ')}` },
        { status: 400 }
      );
    }

    // Atomic: either every selected collection is cleared, or none are — a
    // failure partway through (e.g. one bad collection) must not leave the
    // tenant with some collections wiped and others untouched.
    const results = await runWithOptionalMongoTransaction(async (session) => {
      const r: Record<string, { deleted: number }> = {};
      for (const collectionName of collections) {
        const Model = COLLECTION_MODELS[collectionName];
        const result = await Model.deleteMany({ tenantId: tenant._id }, sessionOpts(session));
        r[collectionName] = { deleted: result.deletedCount || 0 };
      }
      return r;
    });

    // Create audit log
    await createAuditLog(request, {
      tenantId: tenant._id,
      userId: user.userId,
      action: AuditActions.DELETE,
      entityType: 'collections',
      entityId: 'reset',
      changes: {
        collections: collections,
        results: results,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        message: `Successfully reset ${collections.length} collection(s)`,
        results,
      },
    });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    if (error.message === 'Unauthorized' || error.message.includes('Forbidden')) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.message === 'Unauthorized' ? 401 : 403 }
      );
    }
    logger.error('Error resetting collections:', error);
    const t = await getValidationTranslatorFromRequest(request);
    return NextResponse.json(
      { success: false, error: error.message || t('validation.failedToResetCollections', 'Failed to reset collections') },
      { status: 500 }
    );
  }
}

// Restore endpoint - PUT
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    await connectDB();
    const user = await requireAuth(request);
    const limited = rateLimited(request, 'restore', user.userId);
    if (limited) return limited;
    const { slug } = await params;
    
    const tenant = await Tenant.findOne({ slug, isActive: true });
    const t = await getValidationTranslatorFromRequest(request);
    if (!tenant) {
      return NextResponse.json(
        { success: false, error: t('validation.tenantNotFound', 'Tenant not found') },
        { status: 404 }
      );
    }

    // Verify user owns this tenant (unless super_admin)
    if (user.role !== 'super_admin' && user.tenantId !== tenant._id.toString()) {
      return NextResponse.json(
        { success: false, error: t('validation.forbidden', 'You do not have access to this tenant') },
        { status: 403 }
      );
    }

    if (!(await hasTenantPermission(user.role, tenant._id.toString(), 'reset_collections.manage'))) {
      return NextResponse.json(
        { success: false, error: t('validation.forbidden', 'Forbidden: Insufficient permissions') },
        { status: 403 }
      );
    }

    const tooLarge = () => NextResponse.json(
      { success: false, code: 'too_large', error: t('validation.backupTooLarge', 'The backup file is too large to restore (25 MB at most).') },
      { status: 413 }
    );
    const declared = Number(request.headers.get('content-length') || 0);
    if (declared > MAX_RESTORE_BYTES) return tooLarge();
    const raw = await request.text();
    if (Buffer.byteLength(raw, 'utf8') > MAX_RESTORE_BYTES) return tooLarge();

    let body: { backupData?: { collections?: unknown }; clearExisting?: unknown };
    try {
      body = JSON.parse(raw);
    } catch {
      return NextResponse.json(
        { success: false, error: t('validation.invalidBackupDataFormat', 'Invalid backup data format') },
        { status: 400 }
      );
    }
    const backupData = body?.backupData;
    const clearExisting = body?.clearExisting === true;

    if (!backupData || !backupData.collections || typeof backupData.collections !== 'object' || Array.isArray(backupData.collections)) {
      return NextResponse.json(
        { success: false, error: t('validation.invalidBackupDataFormat', 'Invalid backup data format') },
        { status: 400 }
      );
    }

    // Only collections this route restores; audit logs and unknown names are left out and reported.
    const incoming: Record<string, unknown[]> = {};
    const ignored: string[] = [];
    for (const [name, docs] of Object.entries(backupData.collections as Record<string, unknown>)) {
      if (!COLLECTION_MODELS[name] || BACKUP_ONLY.has(name)) { ignored.push(name); continue; }
      incoming[name] = Array.isArray(docs) ? docs.filter((d) => d && typeof d === 'object' && !Array.isArray(d)) : [];
    }

    if (checkRestoreSize(incoming)) {
      return NextResponse.json(
        {
          success: false,
          code: 'too_many_records',
          error: t('validation.backupTooManyRecords', 'The backup file has too many records to restore at once (50,000 in all, 25,000 per collection).'),
        },
        { status: 413 }
      );
    }

    // Atomic: a partial failure (bad document, duplicate key, etc.) must not
    // leave collections cleared-but-not-restored, or one collection restored
    // while a later one silently fails. `ordered: true` inside the session so
    // a single bad document aborts the insert (transactions require ordered writes).
    const results = await runWithOptionalMongoTransaction(async (session) => {
      const r: Record<string, { restored: number; cleared: number; skipped: number; badReference: number }> = {};

      // 1. Clear first, so the checks below see the store as it will be.
      for (const name of Object.keys(incoming)) {
        r[name] = { restored: 0, cleared: 0, skipped: 0, badReference: 0 };
        if (clearExisting) {
          const deleteResult = await COLLECTION_MODELS[name].deleteMany({ tenantId: tenant._id }, sessionOpts(session));
          r[name].cleared = deleteResult.deletedCount || 0;
        }
      }

      // 2. Records keep their original _id so references between collections
      // (product -> category, sale -> product, bundle -> product) still resolve.
      // A record whose _id is already taken (still in this store, or in another
      // one) is skipped, so restoring twice adds nothing.
      const fresh: Record<string, unknown[]> = {};
      for (const [name, docs] of Object.entries(incoming)) {
        const ids = docs.map(ownId).filter((id): id is string => !!id);
        const taken = new Set<string>(
          ids.length
            ? (await COLLECTION_MODELS[name].find({ _id: { $in: ids } }, { _id: 1 }, sessionOpts(session)).lean())
                .map((d: { _id: mongoose.Types.ObjectId }) => d._id.toString())
            : []
        );
        fresh[name] = docs.filter((doc) => { const id = ownId(doc); return !(id && taken.has(id)); });
        r[name].skipped = docs.length - fresh[name].length;
      }

      // 3. Every id a record points at must be in the file or already in THIS store;
      // otherwise the record is skipped (it could point at another store's data).
      const lookup = unresolvedReferences(fresh);
      const existing = new Set<string>();
      if (lookup.length) {
        for (const Model of REFERENCE_MODELS) {
          const found = await Model.find({ _id: { $in: lookup }, tenantId: tenant._id }, { _id: 1 }, sessionOpts(session)).lean();
          for (const d of found as { _id: mongoose.Types.ObjectId }[]) existing.add(d._id.toString());
        }
      }
      const { kept, badReference } = filterByReferences(fresh, existing);

      // 4. Insert, stamped with this store.
      for (const [name, docs] of Object.entries(kept)) {
        r[name].badReference = badReference[name] || 0;
        const documentsToInsert = docs.map((doc: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
          const newDoc = { ...doc };
          if (ownId(newDoc)) newDoc._id = new mongoose.Types.ObjectId(newDoc._id);
          else delete newDoc._id;
          newDoc.tenantId = tenant._id;
          Object.keys(newDoc).forEach((key) => {
            if (typeof newDoc[key] === 'string' && mongoose.Types.ObjectId.isValid(newDoc[key]) && key.endsWith('Id')) {
              newDoc[key] = new mongoose.Types.ObjectId(newDoc[key]);
            }
          });
          if (Array.isArray(newDoc.items)) {
            newDoc.items = newDoc.items.map((item: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
              if (item && typeof item.product === 'string' && mongoose.Types.ObjectId.isValid(item.product)) {
                return { ...item, product: new mongoose.Types.ObjectId(item.product) };
              }
              return item;
            });
          }
          return newDoc;
        });
        if (documentsToInsert.length > 0) {
          await COLLECTION_MODELS[name].insertMany(documentsToInsert, { ordered: true, ...sessionOpts(session) });
        }
        r[name].restored = documentsToInsert.length;
      }

      return r;
    });

    // Create audit log
    await createAuditLog(request, {
      tenantId: tenant._id,
      userId: user.userId,
      action: AuditActions.UPDATE,
      entityType: 'collections',
      entityId: 'restore',
      changes: {
        collections: Object.keys(incoming),
        ignored,
        results: results,
        clearExisting,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        message: `Successfully restored ${Object.keys(incoming).length} collection(s)`,
        results,
        ignored,
      },
    });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    if (error.message === 'Unauthorized' || error.message.includes('Forbidden')) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.message === 'Unauthorized' ? 401 : 403 }
      );
    }
    logger.error('Error restoring backup:', error);
    const t = await getValidationTranslatorFromRequest(request);
    return NextResponse.json(
      { success: false, error: error.message || t('validation.failedToRestoreBackup', 'Failed to restore backup') },
      { status: 500 }
    );
  }
}

