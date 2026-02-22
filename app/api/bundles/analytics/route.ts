import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import ProductBundle from '@/models/ProductBundle';
import Transaction from '@/models/Transaction';
import { getTenantIdFromRequest } from '@/lib/api-tenant';

/**
 * Get bundle analytics - sales performance metrics
 */
export async function GET(request: NextRequest) {
  try {
    await connectDB();
    const tenantId = await getTenantIdFromRequest(request);

    if (!tenantId) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    const searchParams = request.nextUrl.searchParams;
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const bundleId = searchParams.get('bundleId');

    // Build date query
    const dateQuery: any = {}; // eslint-disable-line @typescript-eslint/no-explicit-any
    if (startDate) dateQuery.$gte = new Date(startDate);
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      dateQuery.$lte = end;
    }

    // Get all transactions in the date range
    const transactionQuery: any = { tenantId, status: 'completed' }; // eslint-disable-line @typescript-eslint/no-explicit-any
    if (Object.keys(dateQuery).length > 0) {
      transactionQuery.createdAt = dateQuery;
    }

    const transactions = await Transaction.find(transactionQuery)
      .select('items createdAt total')
      .lean();

    // Get all bundles
    const bundleQuery: any = { tenantId }; // eslint-disable-line @typescript-eslint/no-explicit-any
    if (bundleId) bundleQuery._id = bundleId;
    const bundles = await ProductBundle.find(bundleQuery)
      .select('_id name price')
      .lean();

    // Calculate analytics for each bundle
    const analytics = bundles.map(bundle => {
      let totalSales = 0;
      let totalQuantity = 0;
      let transactionCount = 0;

      // Filter transactions that include this bundle
      transactions.forEach(transaction => {
        transaction.items.forEach((item: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
          // Check if item has bundleId (stored but not in schema)
          const itemBundleId = (item as any).bundleId; // eslint-disable-line @typescript-eslint/no-explicit-any
          if (itemBundleId && itemBundleId.toString() === bundle._id.toString()) {
            totalSales += item.subtotal;
            totalQuantity += item.quantity;
            transactionCount++;
          }
        });
      });

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
      totalTransactions: new Set(
        transactions.flatMap(t => 
          t.items
            .filter((item: any) => (item as any).bundleId) // eslint-disable-line @typescript-eslint/no-explicit-any
            .map((_item: any) => t._id.toString()) // eslint-disable-line @typescript-eslint/no-explicit-any
        )
      ).size,
    };

    return NextResponse.json({
      success: true,
      data: {
        analytics,
        summary,
        period: {
          startDate: startDate || null,
          endDate: endDate || null,
        },
      },
    });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    console.error('Error fetching bundle analytics:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
