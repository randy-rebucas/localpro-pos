import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import connectDB from '@/lib/mongodb';
import Product from '@/models/Product';
import Category from '@/models/Category';
import { requireTenantAccess } from '@/lib/api-tenant';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { validateBulkProductUpdate, type BulkProductUpdates } from '@/lib/validation';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { checkRateLimit } from '@/lib/rate-limit';
import { handleApiError } from '@/lib/error-handler';
import { logger } from '@/lib/logger';

const MAX_BULK_IDS = 100;

type BulkAction = 'update';

export async function PUT(request: NextRequest) {
  try {
    await connectDB();

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

    const tenantObjectId = new mongoose.Types.ObjectId(tenantId);
    const objectIds = validIds.map((id) => new mongoose.Types.ObjectId(id));
    const filter = { _id: { $in: objectIds }, tenantId: tenantObjectId };

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
      const category = await Category.findOne({
        _id: updates.categoryId,
        tenantId,
        isActive: { $ne: false },
      }).lean();

      if (!category) {
        return NextResponse.json({ success: false, error: 'Category not found' }, { status: 404 });
      }

      const result = await Product.updateMany(filter, {
        $set: { categoryId: updates.categoryId, category: category.name },
      });
      modifiedCount = Math.max(modifiedCount, result.modifiedCount);
    }

    if (updates.trackInventory !== undefined) {
      const result = await Product.updateMany(filter, {
        $set: { trackInventory: updates.trackInventory },
      });
      modifiedCount = Math.max(modifiedCount, result.modifiedCount);
    }

    if (updates.lowStockThreshold !== undefined) {
      const result = await Product.updateMany(filter, {
        $set: { lowStockThreshold: updates.lowStockThreshold },
      });
      modifiedCount = Math.max(modifiedCount, result.modifiedCount);
    }

    if (updates.price) {
      const { mode, value } = updates.price;
      if (mode === 'set') {
        const result = await Product.updateMany(filter, { $set: { price: value } });
        modifiedCount = Math.max(modifiedCount, result.modifiedCount);
      } else {
        const multiplier = mode === 'percent' ? 1 + value / 100 : 1;
        const addAmount = mode === 'add' ? value : 0;
        const bulkOps = objectIds.map((id) => ({
          updateOne: {
            filter: { _id: id, tenantId: tenantObjectId },
            update: [
              {
                $set: {
                  price: {
                    $max: [
                      0,
                      mode === 'percent'
                        ? { $multiply: ['$price', multiplier] }
                        : { $add: ['$price', addAmount] },
                    ],
                  },
                },
              },
            ],
          },
        }));
        const result = await Product.bulkWrite(bulkOps as Parameters<typeof Product.bulkWrite>[0]);
        modifiedCount = Math.max(modifiedCount, result.modifiedCount);
      }
    }

    if (updates.stock) {
      const { mode, value } = updates.stock;
      if (mode === 'set') {
        const result = await Product.updateMany(filter, { $set: { stock: value } });
        modifiedCount = Math.max(modifiedCount, result.modifiedCount);
      } else {
        const bulkOps = objectIds.map((id) => ({
          updateOne: {
            filter: { _id: id, tenantId: tenantObjectId },
            update: [
              {
                $set: {
                  stock: { $max: [0, { $add: ['$stock', value] }] },
                },
              },
            ],
          },
        }));
        const result = await Product.bulkWrite(bulkOps as Parameters<typeof Product.bulkWrite>[0]);
        modifiedCount = Math.max(modifiedCount, result.modifiedCount);
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
