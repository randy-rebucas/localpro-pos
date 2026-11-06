import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import ProductBundle from '@/models/ProductBundle';
import Transaction from '@/models/Transaction';
import { requireTenantAccess } from '@/lib/api-tenant';
import { hasTenantPermission } from '@/lib/permissions-server';
import { logger } from '@/lib/logger';
import { REPORT_MAX_TIME_MS } from '@/lib/query-utils';
import mongoose from 'mongoose';

const DEFAULT_RANGE_DAYS = 90;

type BundleSales = {
  _id: mongoose.Types.ObjectId;
  totalSales: number;
  totalQuantity: number;
  transactionCount: number;
};

/**
 * Get bundle analytics - sales performance metrics
 */
export async function GET(request: NextRequest) {
  try {
    await connectDB();
    const { tenantId, user } = await requireTenantAccess(request);

    if (!(await hasTenantPermission(user.role, tenantId, 'bundles.manage'))) {
      return NextResponse.json({ success: false, error: 'Forbidden: Insufficient permissions' }, { status: 403 });
    }

    const searchParams = request.nextUrl.searchParams;
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const bundleId = searchParams.get('bundleId');

    // Bounded by default, so a call without dates can't read a tenant's whole history
    const rangeStart = startDate
      ? new Date(startDate)
      : new Date(Date.now() - DEFAULT_RANGE_DAYS * 86_400_000);
    const rangeEnd = endDate ? new Date(endDate) : new Date();
    rangeEnd.setHours(23, 59, 59, 999);

    // Get all bundles
    const bundleQuery: any = { tenantId }; // eslint-disable-line @typescript-eslint/no-explicit-any
    if (bundleId) bundleQuery._id = bundleId;
    const bundles = await ProductBundle.find(bundleQuery)
      .select('_id name price')
      .lean();
    const bundleIds = bundles.map((bundle) => bundle._id);

    // Checkout stores a bundle line's id in items[].product. Aggregates aren't
    // cast by Mongoose, so tenantId has to be an ObjectId here.
    const salesMatch = {
      tenantId: new mongoose.Types.ObjectId(tenantId),
      status: 'completed',
      createdAt: { $gte: rangeStart, $lte: rangeEnd },
      'items.product': { $in: bundleIds },
    };
    const [sales, totalTransactions] = await Promise.all([
      Transaction.aggregate<BundleSales>([
        { $match: salesMatch },
        { $unwind: '$items' },
        { $match: { 'items.product': { $in: bundleIds } } },
        {
          $group: {
            _id: '$items.product',
            totalSales: { $sum: '$items.subtotal' },
            totalQuantity: { $sum: '$items.quantity' },
            transactionCount: { $sum: 1 },
          },
        },
      ]).option({ maxTimeMS: REPORT_MAX_TIME_MS }),
      Transaction.countDocuments(salesMatch).maxTimeMS(REPORT_MAX_TIME_MS),
    ]);
    const salesByBundle = new Map(sales.map((row) => [row._id.toString(), row]));

    // Calculate analytics for each bundle
    const analytics = bundles.map(bundle => {
      const row = salesByBundle.get(bundle._id.toString());
      const totalSales = row?.totalSales ?? 0;
      const totalQuantity = row?.totalQuantity ?? 0;
      const transactionCount = row?.transactionCount ?? 0;

      const averageOrderValue = transactionCount > 0 ? totalSales / transactionCount : 0;
      const averageQuantity = transactionCount > 0 ? totalQuantity / transactionCount : 0;

      return {
        bundleId: bundle._id,
        bundleName: bundle.name,
        bundlePrice: bundle.price,
        totalSales,
        totalQuantity,
        transactionCount,
        averageOrderValue,
        averageQuantity,
        revenuePerUnit: totalQuantity > 0 ? totalSales / totalQuantity : bundle.price,
      };
    });

    // Sort by total sales descending
    analytics.sort((a, b) => b.totalSales - a.totalSales);

    // Calculate overall summary
    const summary = {
      totalBundles: analytics.length,
      totalSales: analytics.reduce((sum, a) => sum + a.totalSales, 0),
      totalQuantity: analytics.reduce((sum, a) => sum + a.totalQuantity, 0),
      totalTransactions,
    };

    return NextResponse.json({
      success: true,
      data: {
        analytics,
        summary,
        period: {
          startDate: rangeStart.toISOString(),
          endDate: rangeEnd.toISOString(),
        },
      },
    });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    logger.error('Error fetching bundle analytics:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
