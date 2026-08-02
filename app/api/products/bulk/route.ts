import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireTenantAccess } from '@/lib/api-tenant';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { validateBulkProductUpdate, type BulkProductUpdates } from '@/lib/validation';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { checkRateLimit } from '@/lib/rate-limit';
import { handleApiError } from '@/lib/error-handler';
import { logger } from '@/lib/logger';
import { getCategoryById } from '@/lib/data/categories';

const MAX_BULK_IDS = 100;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type BulkAction = 'update';

export async function PUT(request: NextRequest) {
  try {
    let tenantId: string;
    try {
      const tenantAccess = await requireTenantAccess(request);
      tenantId = tenantAccess.tenantId;
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

    const validIds = productIds.filter((id) => UUID_RE.test(id));
    if (validIds.length === 0) {
      return NextResponse.json({ success: false, error: 'No valid product IDs provided' }, { status: 400 });
    }

    if (action !== 'update') {
      return NextResponse.json(
        { success: false, error: 'Action must be "update"' },
        { status: 400 }
      );
    }

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
    const where = { id: { in: validIds }, tenantId };

    if (updates.categoryId) {
      const category = await getCategoryById(tenantId, updates.categoryId);

      if (!category || category.isActive === false) {
        return NextResponse.json({ success: false, error: 'Category not found' }, { status: 404 });
      }

      const result = await prisma.product.updateMany({
        where,
        data: { categoryId: updates.categoryId, category: category.name },
      });
      modifiedCount = Math.max(modifiedCount, result.count);
    }

    if (updates.trackInventory !== undefined) {
      const result = await prisma.product.updateMany({
        where,
        data: { trackInventory: updates.trackInventory },
      });
      modifiedCount = Math.max(modifiedCount, result.count);
    }

    if (updates.lowStockThreshold !== undefined) {
      const result = await prisma.product.updateMany({
        where,
        data: { lowStockThreshold: updates.lowStockThreshold },
      });
      modifiedCount = Math.max(modifiedCount, result.count);
    }

    if (updates.price) {
      const { mode, value } = updates.price;
      if (mode === 'set') {
        const result = await prisma.product.updateMany({ where, data: { price: value } });
        modifiedCount = Math.max(modifiedCount, result.count);
      } else if (mode === 'percent') {
        const multiplier = 1 + value / 100;
        const result = await prisma.$executeRaw`
          UPDATE products SET price = GREATEST(0, price * ${multiplier})
          WHERE id = ANY(${validIds}::uuid[]) AND tenant_id = ${tenantId}::uuid
        `;
        modifiedCount = Math.max(modifiedCount, Number(result));
      } else {
        const result = await prisma.$executeRaw`
          UPDATE products SET price = GREATEST(0, price + ${value})
          WHERE id = ANY(${validIds}::uuid[]) AND tenant_id = ${tenantId}::uuid
        `;
        modifiedCount = Math.max(modifiedCount, Number(result));
      }
    }

    if (updates.stock) {
      const { mode, value } = updates.stock;
      if (mode === 'set') {
        const result = await prisma.product.updateMany({ where, data: { stock: BigInt(value) } });
        modifiedCount = Math.max(modifiedCount, result.count);
      } else {
        const result = await prisma.$executeRaw`
          UPDATE products SET stock = GREATEST(0, stock + ${value})
          WHERE id = ANY(${validIds}::uuid[]) AND tenant_id = ${tenantId}::uuid
        `;
        modifiedCount = Math.max(modifiedCount, Number(result));
      }
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
