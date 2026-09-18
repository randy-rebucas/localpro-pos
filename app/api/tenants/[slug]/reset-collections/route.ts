import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { hasTenantPermission } from '@/lib/permissions-server';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { logger } from '@/lib/logger';

// Map collection names (as used by the tenant-settings backup/reset UI) to
// their Prisma delegate. Kept as `any` because each delegate has a different
// generated type and we only ever call the shared `findMany`/`deleteMany`/
// `createMany` shape on them here.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const COLLECTION_MODELS: Record<string, any> = {
  // Products & Inventory
  products: prisma.product,
  productBundles: prisma.productBundle,
  categories: prisma.category,
  stockMovements: prisma.stockMovement,
  // Sales & Transactions
  transactions: prisma.transaction,
  payments: prisma.payment,
  invoices: prisma.invoice,
  // Customer Management
  customers: prisma.customer,
  addresses: prisma.address,
  customerOTPs: prisma.customerOTP,
  // Discounts & Promotions
  discounts: prisma.discount,
  savedCarts: prisma.savedCart,
  // Loyalty Program
  loyaltyConfigs: prisma.loyaltyConfig,
  loyaltyTransactions: prisma.loyaltyTransaction,
  // Tax & Compliance
  taxRules: prisma.taxRule,
  // Organizational
  branches: prisma.branch,
  expenses: prisma.expense,
  // Cash Management
  cashDrawerSessions: prisma.cashDrawerSession,
  // Staff & Operations
  attendance: prisma.attendance,
  // Bookings & Services
  bookings: prisma.booking,
  // Audit & Compliance
  auditLogs: prisma.auditLog,
};

// FK-safe delete order: children before parents (see prisma/schema.prisma
// relations). A restrict-mode FK (the Prisma default when `onDelete` isn't
// specified) blocks deleting the parent row while a child still references
// it, so rows with an FK to another listed collection must be cleared first.
// - payments/invoices/loyaltyTransactions/stockMovements reference
//   transactions (restrict) -> before transactions
// - savedCarts (via saved_cart_items) and productBundles (via
//   product_bundle_items) reference products (restrict) -> before products
// - invoices/loyaltyTransactions reference customers (restrict) -> before
//   customers
// - products reference categories (restrict) -> before categories
const RESET_ORDER = [
  'auditLogs',
  'payments',
  'invoices',
  'loyaltyTransactions',
  'stockMovements',
  'transactions',
  'savedCarts',
  'productBundles',
  'products',
  'categories',
  'taxRules',
  'discounts',
  'customerOTPs',
  'addresses',
  'customers',
  'cashDrawerSessions',
  'expenses',
  'attendance',
  'bookings',
  'branches',
  'loyaltyConfigs',
];

function orderCollections(collections: string[]): string[] {
  const set = new Set(collections);
  const ordered = RESET_ORDER.filter((c) => set.has(c));
  // Any collection not in RESET_ORDER (shouldn't happen given validation
  // against COLLECTION_MODELS) is appended last.
  for (const c of collections) {
    if (!ordered.includes(c)) ordered.push(c);
  }
  return ordered;
}

// Backup endpoint - GET
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const user = await requireAuth(request);
    const { slug } = await params;
    const t = await getValidationTranslatorFromRequest(request);

    const tenant = await prisma.tenant.findFirst({ where: { slug, isActive: true } });
    if (!tenant) {
      return NextResponse.json(
        { success: false, error: t('validation.tenantNotFound', 'Tenant not found') },
        { status: 404 }
      );
    }

    // Verify user owns this tenant (unless super_admin)
    if (user.role !== 'super_admin' && user.tenantId !== tenant.id) {
      return NextResponse.json(
        { success: false, error: t('validation.forbidden', 'You do not have access to this tenant') },
        { status: 403 }
      );
    }

    if (!(await hasTenantPermission(user.role, tenant.id, 'reset_collections.manage'))) {
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

    const backup: Record<string, unknown[]> = {};
    const counts: Record<string, number> = {};

    // Export data from each collection
    for (const collectionName of collections) {
      const model = COLLECTION_MODELS[collectionName];
      const documents = await model.findMany({ where: { tenantId: tenant.id } });
      backup[collectionName] = documents;
      counts[collectionName] = documents.length;
    }

    const backupData = {
      version: '2.0', // Postgres/Prisma-shaped backup (v1 Mongo backups are not restorable here)
      tenantSlug: slug,
      tenantName: tenant.name,
      createdAt: new Date().toISOString(),
      collections: backup,
      counts,
    };

    // Create audit log
    await createAuditLog(request, {
      tenantId: tenant.id,
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
    const user = await requireAuth(request);
    const { slug } = await params;

    const tenant = await prisma.tenant.findFirst({ where: { slug, isActive: true } });
    const t = await getValidationTranslatorFromRequest(request);
    if (!tenant) {
      return NextResponse.json(
        { success: false, error: t('validation.tenantNotFound', 'Tenant not found') },
        { status: 404 }
      );
    }

    // Verify user owns this tenant (unless super_admin)
    if (user.role !== 'super_admin' && user.tenantId !== tenant.id) {
      return NextResponse.json(
        { success: false, error: t('validation.forbidden', 'You do not have access to this tenant') },
        { status: 403 }
      );
    }

    if (!(await hasTenantPermission(user.role, tenant.id, 'reset_collections.manage'))) {
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

    // Atomic: either every selected collection is cleared, or none are — a
    // failure partway through (e.g. an FK-order mistake) must not leave the
    // tenant with some collections wiped and others untouched.
    const orderedCollections = orderCollections(collections);
    const results = await prisma.$transaction(async (tx) => {
      const r: Record<string, { deleted: number }> = {};
      for (const collectionName of orderedCollections) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const model = (tx as any)[modelKeyFor(collectionName)];
        const result = await model.deleteMany({ where: { tenantId: tenant.id } });
        r[collectionName] = { deleted: result.count || 0 };
      }
      return r;
    });

    // Create audit log
    await createAuditLog(request, {
      tenantId: tenant.id,
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
    const user = await requireAuth(request);
    const { slug } = await params;

    const tenant = await prisma.tenant.findFirst({ where: { slug, isActive: true } });
    const t = await getValidationTranslatorFromRequest(request);
    if (!tenant) {
      return NextResponse.json(
        { success: false, error: t('validation.tenantNotFound', 'Tenant not found') },
        { status: 404 }
      );
    }

    // Verify user owns this tenant (unless super_admin)
    if (user.role !== 'super_admin' && user.tenantId !== tenant.id) {
      return NextResponse.json(
        { success: false, error: t('validation.forbidden', 'You do not have access to this tenant') },
        { status: 403 }
      );
    }

    if (!(await hasTenantPermission(user.role, tenant.id, 'reset_collections.manage'))) {
      return NextResponse.json(
        { success: false, error: t('validation.forbidden', 'Forbidden: Insufficient permissions') },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { backupData, clearExisting = false } = body;

    if (!backupData || !backupData.collections) {
      return NextResponse.json(
        { success: false, error: t('validation.invalidBackupDataFormat', 'Invalid backup data format') },
        { status: 400 }
      );
    }

    if (backupData.version && backupData.version !== '2.0') {
      return NextResponse.json(
        {
          success: false,
          error: t(
            'validation.unsupportedBackupVersion',
            'This backup was created before the PostgreSQL migration and cannot be restored here. Use the archived Mongo backup/restore tooling instead.'
          ),
        },
        { status: 400 }
      );
    }

    // Atomic: a partial failure (bad document, unique-key clash, etc.) must
    // not leave collections cleared-but-not-restored, or one collection
    // restored while a later one silently fails.
    const collectionNames = Object.keys(backupData.collections).filter((c) => COLLECTION_MODELS[c]);
    const orderedForClear = orderCollections(collectionNames);
    const orderedForRestore = [...orderedForClear].reverse(); // parents-first insert order

    const results = await prisma.$transaction(async (tx) => {
      const r: Record<string, { restored: number; cleared: number }> = {};

      if (clearExisting) {
        for (const collectionName of orderedForClear) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const model = (tx as any)[modelKeyFor(collectionName)];
          const deleteResult = await model.deleteMany({ where: { tenantId: tenant.id } });
          r[collectionName] = { restored: 0, cleared: deleteResult.count || 0 };
        }
      }

      for (const collectionName of orderedForRestore) {
        const documents = backupData.collections[collectionName];
        if (!Array.isArray(documents) || documents.length === 0) {
          r[collectionName] = r[collectionName] || { restored: 0, cleared: 0 };
          continue;
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const model = (tx as any)[modelKeyFor(collectionName)];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const documentsToInsert = documents.map((doc: any) => ({
          ...doc,
          tenantId: tenant.id,
        }));

        await model.createMany({ data: documentsToInsert, skipDuplicates: true });
        r[collectionName] = {
          restored: documentsToInsert.length,
          cleared: r[collectionName]?.cleared ?? 0,
        };
      }

      return r;
    });

    // Create audit log
    await createAuditLog(request, {
      tenantId: tenant.id,
      userId: user.userId,
      action: AuditActions.UPDATE,
      entityType: 'collections',
      entityId: 'restore',
      changes: {
        collections: collectionNames,
        results: results,
        clearExisting,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        message: `Successfully restored ${collectionNames.length} collection(s)`,
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
    logger.error('Error restoring backup:', error);
    const t = await getValidationTranslatorFromRequest(request);
    return NextResponse.json(
      { success: false, error: error.message || t('validation.failedToRestoreBackup', 'Failed to restore backup') },
      { status: 500 }
    );
  }
}

// Prisma's transaction client (`tx`) is keyed by camelCase model name, not by
// the human-facing collection name used in the UI/backup JSON — map between
// them explicitly rather than relying on name equality.
const MODEL_KEY_MAP: Record<string, string> = {
  products: 'product',
  productBundles: 'productBundle',
  categories: 'category',
  stockMovements: 'stockMovement',
  transactions: 'transaction',
  payments: 'payment',
  invoices: 'invoice',
  customers: 'customer',
  addresses: 'address',
  customerOTPs: 'customerOTP',
  discounts: 'discount',
  savedCarts: 'savedCart',
  loyaltyConfigs: 'loyaltyConfig',
  loyaltyTransactions: 'loyaltyTransaction',
  taxRules: 'taxRule',
  branches: 'branch',
  expenses: 'expense',
  cashDrawerSessions: 'cashDrawerSession',
  attendance: 'attendance',
  bookings: 'booking',
  auditLogs: 'auditLog',
};

function modelKeyFor(collectionName: string): string {
  return MODEL_KEY_MAP[collectionName] || collectionName;
}
