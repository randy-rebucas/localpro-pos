import { NextRequest, NextResponse } from 'next/server';
import prisma, { dbTransaction } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { hasTenantPermission } from '@/lib/permissions-server';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { logger } from '@/lib/logger';
import { checkRateLimit } from '@/lib/rate-limit';
import {
  BACKUP_COLLECTION_SPECS,
  getCollectionSpec,
  isCollectionKey,
  delegateName,
  orderForReset,
  getMissingResetDependencies,
  collectionLabel,
  type CollectionSpec,
  type ChildSpec,
} from '@/lib/backup-reset-collections';

// Which tables are covered, their cascade child tables, FK-safe ordering and
// reset dependencies all live in lib/backup-reset-collections.ts (checked
// against prisma/schema.prisma by __tests__/backup-reset-collections.test.ts).

// Delegates are typed `any` because each has a different generated type and
// we only call the shared findMany/deleteMany/createMany shape on them.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function delegate(client: any, model: string): any {
  return client[delegateName(model)];
}

function findChild(spec: CollectionSpec, key: string): ChildSpec | undefined {
  return spec.children?.find((c) => c.key === key);
}

// Tenant filter for a child table without its own tenantId: walk the
// relation chain up to the tenant-scoped collection model.
function childScope(spec: CollectionSpec, child: ChildSpec, tenantId: string): Record<string, unknown> {
  const parentChild = findChild(spec, child.parent);
  const parentScope = parentChild ? childScope(spec, parentChild, tenantId) : { tenantId };
  const scope: Record<string, unknown> = { [child.parentRelation]: parentScope };
  if (child.hasTenantId) scope.tenantId = tenantId;
  return scope;
}

// Filter + model for the rows a child's FK is allowed to point at.
function parentTarget(spec: CollectionSpec, child: ChildSpec, tenantId: string) {
  const parentChild = findChild(spec, child.parent);
  return parentChild
    ? { model: parentChild.model, where: childScope(spec, parentChild, tenantId) }
    : { model: spec.model, where: { tenantId } };
}

const ID_CHUNK = 5000;

function describeMissing(missing: { collection: string; missing: string[] }[]): string {
  return missing
    .map((m) => `${collectionLabel(m.collection)} (also needs: ${m.missing.map(collectionLabel).join(', ')})`)
    .join('; ');
}

// Backup endpoint - GET
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const rl = checkRateLimit(`reset-collections-backup:${slug}`, 10, 60_000);
    if (!rl.allowed) {
      return NextResponse.json({ success: false, error: 'Rate limit exceeded' }, { status: 429 });
    }

    const user = await requireAuth(request);
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
    const collections = collectionsParam
      ? collectionsParam.split(',')
      : BACKUP_COLLECTION_SPECS.map((s) => s.key);

    // Validate collection names
    const invalidCollections = collections.filter((col: string) => !isCollectionKey(col));
    if (invalidCollections.length > 0) {
      return NextResponse.json(
        { success: false, error: `Invalid collections: ${invalidCollections.join(', ')}` },
        { status: 400 }
      );
    }

    const backup: Record<string, unknown[]> = {};
    const counts: Record<string, number> = {};

    // Export each collection plus the cascade child tables that hold its line
    // items/details (they have no tenantId of their own, so are scoped via
    // their parent relation).
    for (const collectionName of collections) {
      const spec = getCollectionSpec(collectionName)!;
      const documents = await delegate(prisma, spec.model).findMany({ where: { tenantId: tenant.id } });
      backup[collectionName] = documents;
      counts[collectionName] = documents.length;

      for (const child of spec.children || []) {
        const rows = await delegate(prisma, child.model).findMany({ where: childScope(spec, child, tenant.id) });
        backup[child.key] = rows;
        counts[child.key] = rows.length;
      }
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
    const { slug } = await params;
    const rl = checkRateLimit(`reset-collections-reset:${slug}`, 5, 60_000);
    if (!rl.allowed) {
      return NextResponse.json({ success: false, error: 'Rate limit exceeded' }, { status: 429 });
    }

    const user = await requireAuth(request);

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
    const invalidCollections = collections.filter((col: unknown) => typeof col !== 'string' || !isCollectionKey(col));
    if (invalidCollections.length > 0) {
      return NextResponse.json(
        { success: false, error: `Invalid collections: ${invalidCollections.join(', ')}` },
        { status: 400 }
      );
    }

    // Rows in an unselected collection that hold a required (RESTRICT) FK
    // would make the delete fail mid-transaction; reject up front instead.
    const missingDependencies = getMissingResetDependencies(collections);
    if (missingDependencies.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: `${t('validation.resetDependenciesMissing', 'Some selected collections are still referenced by others and must be reset together')}: ${describeMissing(missingDependencies)}`,
          missingDependencies,
        },
        { status: 400 }
      );
    }

    // Atomic: either every selected collection is cleared, or none are — a
    // failure partway through must not leave the tenant with some
    // collections wiped and others untouched. Cascade child tables are
    // removed by the database with their parent rows.
    const orderedCollections = orderForReset(collections);
    // Prisma's default 5s transaction timeout is easy to blow through when
    // deleting across ~20 collections for a tenant with real data volume; a
    // timed-out transaction fully rolls back (still atomic) but the reset
    // would then always fail for any non-trivial tenant.
    const results = await dbTransaction(async (tx) => {
      const r: Record<string, { deleted: number }> = {};
      for (const collectionName of orderedCollections) {
        const spec = getCollectionSpec(collectionName)!;
        const result = await delegate(tx, spec.model).deleteMany({ where: { tenantId: tenant.id } });
        r[collectionName] = { deleted: result.count || 0 };
      }
      return r;
    }, { timeout: 120_000, maxWait: 10_000 });

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
    const { slug } = await params;
    const rl = checkRateLimit(`reset-collections-restore:${slug}`, 5, 60_000);
    if (!rl.allowed) {
      return NextResponse.json({ success: false, error: 'Rate limit exceeded' }, { status: 429 });
    }

    const user = await requireAuth(request);

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
    // Child-table keys (e.g. transactionItems) are restored with their parent
    // collection, never on their own.
    const collectionNames = Object.keys(backupData.collections).filter((c) => isCollectionKey(c));
    const orderedForClear = orderForReset(collectionNames);
    const orderedForRestore = [...orderedForClear].reverse(); // parents-first insert order

    if (clearExisting) {
      const missingDependencies = getMissingResetDependencies(collectionNames);
      if (missingDependencies.length > 0) {
        return NextResponse.json(
          {
            success: false,
            error: `${t('validation.restoreClearDependenciesMissing', 'Existing data cannot be cleared because other collections not in this backup still reference it')}: ${describeMissing(missingDependencies)}`,
            missingDependencies,
          },
          { status: 400 }
        );
      }
    }

    // Same rationale as the reset transaction above: clearing + bulk-inserting
    // across many tables can exceed Prisma's 5s default transaction timeout.
    const results = await dbTransaction(async (tx) => {
      const r: Record<string, { restored: number; cleared: number; skipped?: number }> = {};

      if (clearExisting) {
        for (const collectionName of orderedForClear) {
          const spec = getCollectionSpec(collectionName)!;
          const deleteResult = await delegate(tx, spec.model).deleteMany({ where: { tenantId: tenant.id } });
          r[collectionName] = { restored: 0, cleared: deleteResult.count || 0 };
        }
      }

      for (const collectionName of orderedForRestore) {
        const spec = getCollectionSpec(collectionName)!;
        const documents = backupData.collections[collectionName];
        if (Array.isArray(documents) && documents.length > 0) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const documentsToInsert = documents.map((doc: any) => {
            const row = { ...doc, tenantId: tenant.id };
            for (const field of spec.stripOnRestore || []) row[field] = null;
            return row;
          });
          const created = await delegate(tx, spec.model).createMany({ data: documentsToInsert, skipDuplicates: true });
          r[collectionName] = { restored: created.count ?? 0, cleared: r[collectionName]?.cleared ?? 0 };
        } else {
          r[collectionName] = r[collectionName] || { restored: 0, cleared: 0 };
        }

        // Child rows carry no tenantId, so a crafted backup could point them
        // at another tenant's parent rows. Only insert children whose parent
        // id resolves to a row inside this tenant.
        for (const child of spec.children || []) {
          const rows = backupData.collections[child.key];
          if (!Array.isArray(rows) || rows.length === 0) continue;

          const target = parentTarget(spec, child, tenant.id);
          const parentIds = [...new Set(rows.map((row: Record<string, unknown>) => row?.[child.fk]).filter((v): v is string => typeof v === 'string'))];
          const allowed = new Set<string>();
          for (let i = 0; i < parentIds.length; i += ID_CHUNK) {
            const found = await delegate(tx, target.model).findMany({
              where: { ...target.where, id: { in: parentIds.slice(i, i + ID_CHUNK) } },
              select: { id: true },
            });
            for (const p of found) allowed.add(p.id);
          }

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const safeRows = rows.filter((row: any) => allowed.has(row?.[child.fk]))
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .map((row: any) => (child.hasTenantId ? { ...row, tenantId: tenant.id } : row));
          const created = safeRows.length > 0
            ? await delegate(tx, child.model).createMany({ data: safeRows, skipDuplicates: true })
            : { count: 0 };
          r[child.key] = { restored: created.count ?? 0, cleared: 0, skipped: rows.length - safeRows.length };
        }
      }

      return r;
    }, { timeout: 120_000, maxWait: 10_000 });

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
