import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import ProductBatch from '@/models/ProductBatch';
import { requireTenantAccess } from '@/lib/api-tenant';
import { handleApiError } from '@/lib/error-handler';
import mongoose from 'mongoose';

/**
 * GET /api/product-batches/expiring
 * Returns non-depleted batches expiring within N days (default 30, max 365).
 * Query: days?, productId?, branchId?, limit?, page?
 */
export async function GET(request: NextRequest) {
  try {
    await connectDB();
    const { tenantId } = await requireTenantAccess(request);
    const params = request.nextUrl.searchParams;

    const days = parseInt(params.get('days') || '30');
    if (isNaN(days) || days <= 0 || days > 365) {
      return NextResponse.json(
        { success: false, error: 'days must be a number between 1 and 365' },
        { status: 400 }
      );
    }

    const now    = new Date();
    const cutoff = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

    const query: Record<string, unknown> = {
      tenantId,
      isActive: true,
      expiryDate: { $exists: true, $gte: now, $lte: cutoff },
      remainingQuantity: { $gt: 0 },
    };

    if (params.get('productId')) query.productId = new mongoose.Types.ObjectId(params.get('productId')!);
    if (params.get('branchId'))  query.branchId  = new mongoose.Types.ObjectId(params.get('branchId')!);

    const limit = Math.min(parseInt(params.get('limit') || '50'), 200);
    const page  = Math.max(1, parseInt(params.get('page') || '1'));
    const skip  = (page - 1) * limit;

    const [batches, total] = await Promise.all([
      ProductBatch.find(query)
        .populate('productId',  'name sku')
        .populate('supplierId', 'name')
        .populate('branchId',   'name')
        .sort({ expiryDate: 1 })
        .limit(limit)
        .skip(skip)
        .lean(),
      ProductBatch.countDocuments(query),
    ]);

    return NextResponse.json({
      success: true,
      data: batches,
      meta: {
        days,
        cutoffDate: cutoff.toISOString(),
        count: total,
      },
      pagination: { total, page, limit, pages: Math.ceil(total / limit) },
    });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    return handleApiError(error, 'Failed to get expiring batches');
  }
}
