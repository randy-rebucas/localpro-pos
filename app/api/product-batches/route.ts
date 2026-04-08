import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import ProductBatch from '@/models/ProductBatch';
import { requireTenantAccess } from '@/lib/api-tenant';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { handleApiError } from '@/lib/error-handler';
import mongoose from 'mongoose';

/**
 * GET /api/product-batches
 * Query: productId?, supplierId?, branchId?, includeExpired?, limit?, page?
 */
export async function GET(request: NextRequest) {
  try {
    await connectDB();
    const { tenantId } = await requireTenantAccess(request);
    const params = request.nextUrl.searchParams;

    const query: Record<string, unknown> = { tenantId };

    // Default: exclude expired and depleted batches unless caller asks otherwise
    if (params.get('includeExpired') !== 'true') {
      query.isActive = true;
      // Exclude already-expired stock
      query.$or = [
        { expiryDate: { $exists: false } },
        { expiryDate: { $gte: new Date() } },
      ];
    }

    if (params.get('productId'))  query.productId  = new mongoose.Types.ObjectId(params.get('productId')!);
    if (params.get('supplierId')) query.supplierId = new mongoose.Types.ObjectId(params.get('supplierId')!);
    if (params.get('branchId'))   query.branchId   = new mongoose.Types.ObjectId(params.get('branchId')!);

    const limit = Math.min(parseInt(params.get('limit') || '50'), 200);
    const page  = Math.max(1, parseInt(params.get('page') || '1'));
    const skip  = (page - 1) * limit;

    const [batches, total] = await Promise.all([
      ProductBatch.find(query)
        .populate('productId',  'name sku')
        .populate('supplierId', 'name')
        .populate('branchId',   'name')
        .sort({ expiryDate: 1, createdAt: -1 })
        .limit(limit)
        .skip(skip)
        .lean(),
      ProductBatch.countDocuments(query),
    ]);

    return NextResponse.json({
      success: true,
      data: batches,
      pagination: { total, page, limit, pages: Math.ceil(total / limit) },
    });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    return handleApiError(error, 'Failed to list product batches');
  }
}

/**
 * POST /api/product-batches
 * Body: { productId, batchNumber, quantity, lotNumber?, manufacturingDate?, expiryDate?,
 *         supplierId?, branchId?, costPerUnit?, notes? }
 */
export async function POST(request: NextRequest) {
  try {
    await connectDB();
    const { tenantId } = await requireTenantAccess(request);
    const body = await request.json();
    const {
      productId, batchNumber, lotNumber,
      manufacturingDate, expiryDate,
      quantity, supplierId, branchId, costPerUnit, notes,
    } = body;

    if (!productId || !batchNumber?.trim() || quantity === undefined) {
      return NextResponse.json(
        { success: false, error: 'productId, batchNumber, and quantity are required' },
        { status: 400 }
      );
    }

    const qty = Number(quantity);
    if (!Number.isFinite(qty) || qty <= 0) {
      return NextResponse.json({ success: false, error: 'quantity must be a positive number' }, { status: 400 });
    }

    if (costPerUnit !== undefined && (Number.isNaN(Number(costPerUnit)) || Number(costPerUnit) < 0)) {
      return NextResponse.json({ success: false, error: 'costPerUnit must be a non-negative number' }, { status: 400 });
    }

    let parsedMfgDate: Date | undefined;
    let parsedExpDate: Date | undefined;

    if (manufacturingDate) {
      parsedMfgDate = new Date(manufacturingDate);
      if (isNaN(parsedMfgDate.getTime())) {
        return NextResponse.json({ success: false, error: 'Invalid manufacturingDate' }, { status: 400 });
      }
    }
    if (expiryDate) {
      parsedExpDate = new Date(expiryDate);
      if (isNaN(parsedExpDate.getTime())) {
        return NextResponse.json({ success: false, error: 'Invalid expiryDate' }, { status: 400 });
      }
      if (parsedMfgDate && parsedExpDate <= parsedMfgDate) {
        return NextResponse.json(
          { success: false, error: 'expiryDate must be after manufacturingDate' },
          { status: 400 }
        );
      }
    }

    // Check for duplicate batchNumber within tenant
    const duplicate = await ProductBatch.exists({ tenantId, batchNumber: batchNumber.trim() });
    if (duplicate) {
      return NextResponse.json(
        { success: false, error: `Batch number "${batchNumber.trim()}" already exists for this tenant` },
        { status: 409 }
      );
    }

    const batch = await ProductBatch.create({
      tenantId,
      productId,
      branchId:          branchId || undefined,
      supplierId:        supplierId || undefined,
      batchNumber:       batchNumber.trim(),
      lotNumber:         lotNumber?.trim() || undefined,
      manufacturingDate: parsedMfgDate,
      expiryDate:        parsedExpDate,
      quantity:          qty,
      remainingQuantity: qty,
      costPerUnit:       costPerUnit !== undefined ? Number(costPerUnit) : undefined,
      notes:             notes?.trim() || undefined,
    });

    await createAuditLog(request, {
      tenantId,
      action: AuditActions.CREATE,
      entityType: 'product_batch',
      entityId: batch._id.toString(),
      metadata: { productId, batchNumber: batch.batchNumber, quantity: qty },
    });

    return NextResponse.json({ success: true, data: batch }, { status: 201 });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    return handleApiError(error, 'Failed to create product batch');
  }
}
