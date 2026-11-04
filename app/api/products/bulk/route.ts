import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { getRepos, type ProductFilter } from '@/lib/db';
import { requireTenantAccess } from '@/lib/api-tenant';
import { hasTenantPermission } from '@/lib/permissions-server';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { validateBulkProductUpdate, type BulkProductUpdates } from '@/lib/validation';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { checkRateLimit } from '@/lib/rate-limit';
import { handleApiError } from '@/lib/error-handler';
import { logger } from '@/lib/logger';
import { updateStock, insertStockMovements, STOCK_SNAPSHOT_FIELDS, StockMovementInput } from '@/lib/stock';

const MAX_BULK_IDS = 100;

type BulkAction = 'update';

export async function PUT(request: NextRequest) {
  try {
    let tenantId: string;
    let userId: string;
    let userRole: string;
    try {
      const tenantAccess = await requireTenantAccess(request);
      tenantId = tenantAccess.tenantId;
      userId = tenantAccess.user.userId;
      userRole = tenantAccess.user.role;
    } catch (authError: unknown) {
      const message = authError instanceof Error ? authError.message : 'Unauthorized';
      if (message.includes('Unauthorized') || message.includes('Forbidden')) {
        return NextResponse.json(
          { success: false, error: message },
          { status: message.includes('Unauthorized') ? 401 : 403 }
        );
      }
      throw authError;
    }

    if (!(await hasTenantPermission(userRole, tenantId, 'products.manage'))) {
      return NextResponse.json(
        { success: false, error: 'Forbidden: Insufficient permissions' },
        { status: 403 }
      );
    }

    const ip = request.headers.get('x-forwarded-for') ?? 'unknown';
    const { allowed } = checkRateLimit(`write:products:bulk:${tenantId}:${ip}`, 20, 60_000);
    if (!allowed) {
      return NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429 });
    }

    const body = await request.json();
    const { productIds, action, updates } = body as {
      productIds?: string[];
      action?: BulkAction;
      updates?: BulkProductUpdates;
    };

    if (!productIds || !Array.isArray(productIds) || productIds.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Product IDs array is required' },
        { status: 400 }
      );
    }

    if (productIds.length > MAX_BULK_IDS) {
      return NextResponse.json(
        { success: false, error: `Cannot update more than ${MAX_BULK_IDS} products at once` },
        { status: 400 }
      );
    }

    const validIds = productIds.filter((id) => mongoose.Types.ObjectId.isValid(id));
    if (validIds.length === 0) {
      return NextResponse.json({ success: false, error: 'No valid product IDs provided' }, { status: 400 });
    }

    if (action !== 'update') {
      return NextResponse.json(
        { success: false, error: 'Action must be "update"' },
        { status: 400 }
      );
    }

    const { products } = getRepos();
    const filter: ProductFilter = { ids: validIds };

    if (!updates || typeof updates !== 'object') {
      return NextResponse.json(
        { success: false, error: 'Updates object is required for update action' },
        { status: 400 }
      );
    }

    const updateKeys = Object.keys(updates).filter(
      (key) => updates[key as keyof BulkProductUpdates] !== undefined
    );
    if (updateKeys.length === 0) {
      return NextResponse.json(
        { success: false, error: 'At least one field must be provided in updates' },
        { status: 400 }
      );
    }

    const t = await getValidationTranslatorFromRequest(request);
    const errors = validateBulkProductUpdate(updates as Record<string, unknown>, t);
    if (errors.length > 0) {
      return NextResponse.json({ success: false, errors }, { status: 400 });
    }

    let modifiedCount = 0;

    if (updates.categoryId) {
      const category = await getRepos().categories.findById(tenantId, updates.categoryId, { activeOnly: true });

      if (!category) {
        return NextResponse.json({ success: false, error: 'Category not found' }, { status: 404 });
      }

      const changed = await products.updateMany(tenantId, filter, { categoryId: updates.categoryId, category: category.name });
      modifiedCount = Math.max(modifiedCount, changed);
    }

    if (updates.trackInventory !== undefined) {
      const changed = await products.updateMany(tenantId, filter, { trackInventory: updates.trackInventory });
      modifiedCount = Math.max(modifiedCount, changed);
    }

    if (updates.lowStockThreshold !== undefined) {
      const changed = await products.updateMany(tenantId, filter, { lowStockThreshold: updates.lowStockThreshold });
      modifiedCount = Math.max(modifiedCount, changed);
    }

    if (updates.price) {
      const { mode, value } = updates.price;
      if (mode === 'set') {
        const changed = await products.updateMany(tenantId, filter, { price: value });
        modifiedCount = Math.max(modifiedCount, changed);
      } else {
        // Per product: max(0, price × (1 + value/100)) or max(0, price + value)
        const changed = await products.adjustPrices(tenantId, validIds, { mode: mode as 'percent' | 'add', value });
        modifiedCount = Math.max(modifiedCount, changed);
      }
    }

    if (updates.stock) {
      const { mode, value } = updates.stock;
      // Applied one product at a time through updateStock() so each change gets a
      // StockMovement record and the allowOutOfStockSales guard is honored consistently.
      // The batch read doubles as each product's snapshot (no per-product re-read),
      // and the movements are inserted together.
      const productsForStock = await products.list(tenantId, filter, { select: STOCK_SNAPSHOT_FIELDS });
      const movements: StockMovementInput[] = [];
      let stockModified = 0;
      for (const p of productsForStock) {
        if (p.trackInventory === false) continue;
        const currentStock = p.stock || 0;
        const delta = mode === 'set' ? value - currentStock : value;
        if (delta === 0) continue;
        try {
          await updateStock(p._id, tenantId, delta, 'adjustment', {
            userId,
            reason: 'Bulk stock update',
            product: p,
            movements,
          });
          stockModified += 1;
        } catch (err) {
          logger.error(`Bulk stock update failed for product ${p._id}:`, err);
        }
      }
      await insertStockMovements(movements);
      modifiedCount = Math.max(modifiedCount, stockModified);
    }

    await createAuditLog(request, {
      tenantId,
      action: AuditActions.UPDATE,
      entityType: 'product',
      entityId: 'bulk',
      changes: { productIds: validIds, action, updates, count: modifiedCount },
    });

    return NextResponse.json({
      success: true,
      message: `${modifiedCount} product(s) updated successfully`,
      modifiedCount,
    });
  } catch (error: unknown) {
    logger.error('Error in bulk product operation:', error);
    return handleApiError(error, 'Failed to bulk update products');
  }
}
