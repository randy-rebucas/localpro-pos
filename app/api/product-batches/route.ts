import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import ProductBatch from '@/models/ProductBatch';
import { requireTenantAccess } from '@/lib/api-tenant';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { handleApiError } from '@/lib/error-handler';
import mongoose from 'mongoose';

export async function GET(request: NextRequest) {
  try {
    await connectDB();
    const { tenantId } = await requireTenantAccess(request);
    const params = request.nextUrl.searchParams;

    const query: Record<string, unknown> = { tenantId, isActive: true };
    if (params.get('productId')) query.productId = new mongoose.Types.ObjectId(params.get('productId')!);
    if (params.get('supplierId')) query.supplierId = new mongoose.Types.ObjectId(params.get('supplierId')!);

    const limit = Math.min(parseInt(params.get('limit') || '50'), 200);
    const batches = await ProductBatch.find(query)
      .populate('productId', 'name sku')
      .populate('supplierId', 'name')
      .sort({ expiryDate: 1, createdAt: -1 })
      .limit(limit)
      .lean();

    return NextResponse.json({ success: true, data: batches });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    return handleApiError(error, 'Failed to list product batches');
  }
}

export async function POST(request: NextRequest) {
  try {
    await connectDB();
    const { tenantId } = await requireTenantAccess(request);
    const body = await request.json();
    const { productId, batchNumber, lotNumber, manufacturingDate, expiryDate, quantity, supplierId, branchId, costPerUnit, notes } = body;

    if (!productId || !batchNumber || quantity === undefined) {
      return NextResponse.json({ success: false, error: 'productId, batchNumber, and quantity are required' }, { status: 400 });
    }

    const batch = await ProductBatch.create({
      tenantId,
      productId,
      branchId,
      supplierId,
      batchNumber: batchNumber.trim(),
      lotNumber,
      manufacturingDate: manufacturingDate ? new Date(manufacturingDate) : undefined,
      expiryDate: expiryDate ? new Date(expiryDate) : undefined,
      quantity: Number(quantity),
      remainingQuantity: Number(quantity),
      costPerUnit,
      notes,
    });

    await createAuditLog(request, {
      tenantId,
      action: AuditActions.CREATE,
      entityType: 'product_batch',
      entityId: batch._id.toString(),
      metadata: { productId, batchNumber, quantity },
    });

    return NextResponse.json({ success: true, data: batch }, { status: 201 });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    return handleApiError(error, 'Failed to create product batch');
  }
}
