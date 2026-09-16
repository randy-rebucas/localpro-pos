import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import connectDB from '@/lib/mongodb';
import Product from '@/models/Product';
import { requireTenantAccess } from '@/lib/api-tenant';
import { hasTenantPermission } from '@/lib/permissions-server';
import { updateStock } from '@/lib/stock';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { checkRateLimit } from '@/lib/rate-limit';
import { handleApiError } from '@/lib/error-handler';
import { logger } from '@/lib/logger';

const MAX_RESTOCK_ITEMS = 200;

interface RestockItem {
  productId: string;
  quantity: number;
}

/**
 * Receive a delivery / restock many products in one request. Each item is applied
 * through updateStock() individually so every product gets its own logged
 * StockMovement (type 'purchase') rather than a single opaque bulk write.
 */
export async function POST(request: NextRequest) {
  try {
    await connectDB();

    let tenantId: string;
    let userId: string;
    try {
      const tenantAccess = await requireTenantAccess(request);
      tenantId = tenantAccess.tenantId;
      userId = tenantAccess.user.userId;
      if (!(await hasTenantPermission(tenantAccess.user.role, tenantId, 'products.manage'))) {
        return NextResponse.json(
          { success: false, error: 'Forbidden: Insufficient permissions' },
          { status: 403 }
        );
      }
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
    const { allowed } = checkRateLimit(`bulk-restock:${tenantId}:${ip}`, 10, 60_000);
    if (!allowed) {
      return NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429 });
    }

    const body = await request.json();
    const { items, reason, notes } = body as { items?: RestockItem[]; reason?: string; notes?: string };

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ success: false, error: 'items array is required' }, { status: 400 });
    }

    if (items.length > MAX_RESTOCK_ITEMS) {
      return NextResponse.json(
        { success: false, error: `Cannot restock more than ${MAX_RESTOCK_ITEMS} products at once` },
        { status: 400 }
      );
    }

    const seen = new Set<string>();
    const validItems: RestockItem[] = [];
    const validationErrors: Array<{ productId: string; error: string }> = [];

    for (const item of items) {
      if (!item || !mongoose.Types.ObjectId.isValid(item.productId)) {
        validationErrors.push({ productId: String(item?.productId), error: 'Invalid product ID' });
        continue;
      }
      if (seen.has(item.productId)) {
        validationErrors.push({ productId: item.productId, error: 'Duplicate product in request' });
        continue;
      }
      if (typeof item.quantity !== 'number' || !Number.isFinite(item.quantity) || item.quantity <= 0) {
        validationErrors.push({ productId: item.productId, error: 'Quantity must be greater than 0' });
        continue;
      }
      seen.add(item.productId);
      validItems.push(item);
    }

    const results: Array<{ productId: string; newStock: number }> = [];
    const failed: Array<{ productId: string; error: string }> = [...validationErrors];

    for (const item of validItems) {
      try {
        await updateStock(item.productId, tenantId, item.quantity, 'purchase', {
          userId,
          reason: reason || 'Bulk restock',
          notes,
        });
        const product = await Product.findOne({ _id: item.productId, tenantId }).select('stock').lean();
        results.push({ productId: item.productId, newStock: product?.stock ?? 0 });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to restock';
        failed.push({ productId: item.productId, error: message });
        logger.error(`Bulk restock failed for product ${item.productId}:`, err);
      }
    }

    if (results.length > 0) {
      await createAuditLog(request, {
        tenantId,
        userId,
        action: AuditActions.UPDATE,
        entityType: 'product',
        entityId: 'bulk-restock',
        changes: { restocked: results.length, failed: failed.length, reason },
      });
    }

    return NextResponse.json({
      success: true,
      restocked: results.length,
      failed: failed.length,
      results,
      errors: failed,
    });
  } catch (error: unknown) {
    return handleApiError(error, 'Failed to process bulk restock');
  }
}
