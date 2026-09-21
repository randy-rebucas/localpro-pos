import { NextRequest, NextResponse } from 'next/server';
import prisma, { dbTransaction } from '@/lib/db';
import { Prisma } from '@prisma/client';
import { requireTenantAccess } from '@/lib/api-tenant';
import { hasTenantPermission } from '@/lib/permissions-server';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { validateBulkProductUpdate, type BulkProductUpdates } from '@/lib/validation';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { checkRateLimit } from '@/lib/rate-limit';
import { handleApiError } from '@/lib/error-handler';
import { logger } from '@/lib/logger';
import { updateStock } from '@/lib/stock';

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

    const validIds = productIds.filter((id) => typeof id === 'string' && id.length > 0);
    if (validIds.length === 0) {
      return NextResponse.json({ success: false, error: 'No valid product IDs provided' }, { status: 400 });
    }

    if (action !== 'update') {
      return NextResponse.json(
        { success: false, error: 'Action must be "update"' },
        { status: 400 }
      );
    }

    const where: Prisma.ProductWhereInput = { id: { in: validIds }, tenantId };

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
      const category = await prisma.category.findFirst({
        where: { id: updates.categoryId, tenantId, isActive: { not: false } },
      });
      if (!category) {
        return NextResponse.json({ success: false, error: 'Category not found' }, { status: 404 });
      }
    }

    // categoryId/trackInventory/lowStockThreshold/price are applied together
    // in one transaction so a mid-batch failure (e.g. the raw-SQL price update
    // throwing) can't leave products with some fields updated and others not.
    if (updates.categoryId || updates.trackInventory !== undefined || updates.lowStockThreshold !== undefined || updates.price) {
      modifiedCount = await dbTransaction(async (tx) => {
        let count = 0;

        if (updates.categoryId) {
          const category = await tx.category.findFirst({
            where: { id: updates.categoryId, tenantId, isActive: { not: false } },
          });
          if (!category) {
            throw new Error('CATEGORY_NOT_FOUND');
          }
          const result = await tx.product.updateMany({
            where,
            data: { categoryId: updates.categoryId, category: category.name },
          });
          count = Math.max(count, result.count);
        }

        if (updates.trackInventory !== undefined) {
          const result = await tx.product.updateMany({
            where,
            data: { trackInventory: updates.trackInventory },
          });
          count = Math.max(count, result.count);
        }

        if (updates.lowStockThreshold !== undefined) {
          const result = await tx.product.updateMany({
            where,
            data: { lowStockThreshold: updates.lowStockThreshold },
          });
          count = Math.max(count, result.count);
        }

        if (updates.price) {
          const { mode, value } = updates.price;
          if (mode === 'set') {
            const result = await tx.product.updateMany({ where, data: { price: value } });
            count = Math.max(count, result.count);
          } else {
            const multiplier = mode === 'percent' ? 1 + value / 100 : 1;
            const addAmount = mode === 'add' ? value : 0;
            // Postgres has no per-row $multiply/$add update expression like Mongo's
            // aggregation-pipeline update — apply each product's new price via raw SQL
            // so the max(0, ...) floor and per-row current price are still honored atomically.
            const result = mode === 'percent'
              ? await tx.$executeRaw`
                  UPDATE products SET price = GREATEST(0, price * ${multiplier})
                  WHERE id = ANY(${validIds}) AND "tenantId" = ${tenantId}
                `
              : await tx.$executeRaw`
                  UPDATE products SET price = GREATEST(0, price + ${addAmount})
                  WHERE id = ANY(${validIds}) AND "tenantId" = ${tenantId}
                `;
            count = Math.max(count, result);
          }
        }

        return count;
      });
    }

    if (updates.stock) {
      const { mode, value } = updates.stock;
      // Applied one product at a time through updateStock() so each change gets a
      // StockMovement record and the allowOutOfStockSales guard is honored consistently.
      const productsForStock = await prisma.product.findMany({
        where,
        select: { id: true, stock: true, trackInventory: true },
      });
      let stockModified = 0;
      for (const p of productsForStock) {
        if (p.trackInventory === false) continue;
        const currentStock = p.stock || 0;
        const delta = mode === 'set' ? value - currentStock : value;
        if (delta === 0) continue;
        try {
          await updateStock(p.id, tenantId, delta, 'adjustment', {
            userId,
            reason: 'Bulk stock update',
          });
          stockModified += 1;
        } catch (err) {
          logger.error(`Bulk stock update failed for product ${p.id}:`, err);
        }
      }
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
