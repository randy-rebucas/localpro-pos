import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import ProductBatch from '@/models/ProductBatch';
import { requireTenantAccess } from '@/lib/api-tenant';
import { handleApiError } from '@/lib/error-handler';

/**
 * GET /api/product-batches/expiring
 * Returns batches expiring within N days (default 30).
 * Query: days (number)
 */
export async function GET(request: NextRequest) {
  try {
    await connectDB();
    const { tenantId } = await requireTenantAccess(request);
    const days = Math.min(parseInt(request.nextUrl.searchParams.get('days') || '30'), 365);

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() + days);

    const batches = await ProductBatch.find({
      tenantId,
      isActive: true,
      expiryDate: { $exists: true, $lte: cutoff, $gte: new Date() },
      remainingQuantity: { $gt: 0 },
    })
      .populate('productId', 'name sku')
      .populate('supplierId', 'name')
      .sort({ expiryDate: 1 })
      .lean();

    return NextResponse.json({
      success: true,
      data: batches,
      meta: { days, count: batches.length, cutoffDate: cutoff.toISOString() },
    });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    return handleApiError(error, 'Failed to get expiring batches');
  }
}
