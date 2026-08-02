import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { hasTenantPermission } from '@/lib/permissions-server';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { logger } from '@/lib/logger';
import { getTenantBySlug } from '@/lib/data/tenants';

// Map collection names to their Prisma delegates
const COLLECTION_MODELS: Record<string, any> = { // eslint-disable-line @typescript-eslint/no-explicit-any
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

// Backup endpoint - GET
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const user = await requireAuth(request);
    const { slug } = await params;
    const t = await getValidationTranslatorFromRequest(request);

    const tenant = await getTenantBySlug(slug);
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

    const backup: Record<string, any[]> = {}; // eslint-disable-line @typescript-eslint/no-explicit-any
    const counts: Record<string, number> = {};

    // Export data from each collection
    for (const collectionName of collections) {
      const model = COLLECTION_MODELS[collectionName];
      const documents = await model.findMany({ where: { tenantId: tenant.id } });
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

    const tenant = await getTenantBySlug(slug);
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

    const results: Record<string, { deleted: number }> = {};

    // Delete documents for each collection
    for (const collectionName of collections) {
      const model = COLLECTION_MODELS[collectionName];
      const result = await model.deleteMany({ where: { tenantId: tenant.id } });
      results[collectionName] = { deleted: result.count || 0 };
    }

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

    const tenant = await getTenantBySlug(slug);
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

    const results: Record<string, { restored: number; cleared: number }> = {};

    // Restore each collection
    for (const [collectionName, documents] of Object.entries(backupData.collections)) {
      if (!COLLECTION_MODELS[collectionName]) {
        continue; // Skip invalid collections
      }

      const model = COLLECTION_MODELS[collectionName];
      let cleared = 0;

      // Clear existing data if requested
      if (clearExisting) {
        const deleteResult = await model.deleteMany({ where: { tenantId: tenant.id } });
        cleared = deleteResult.count || 0;
      }

      // Restore documents
      let restored = 0;
      if (Array.isArray(documents) && documents.length > 0) {
        for (const doc of documents as any[]) { // eslint-disable-line @typescript-eslint/no-explicit-any
          const newDoc = { ...doc };
          // Remove id to let the database assign a new one; ensure tenantId matches current tenant
          delete newDoc.id;
          delete newDoc._id;
          newDoc.tenantId = tenant.id;

          try {
            await model.create({ data: newDoc });
            restored++;
          } catch (createError) {
            // Best-effort restore, matching the previous insertMany({ ordered: false }) behavior
            logger.error(`Failed to restore document in ${collectionName}:`, createError);
          }
        }
      }
      results[collectionName] = { restored, cleared };
    }

    // Create audit log
    await createAuditLog(request, {
      tenantId: tenant.id,
      userId: user.userId,
      action: AuditActions.UPDATE,
      entityType: 'collections',
      entityId: 'restore',
      changes: {
        collections: Object.keys(backupData.collections),
        results: results,
        clearExisting,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        message: `Successfully restored ${Object.keys(backupData.collections).length} collection(s)`,
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
