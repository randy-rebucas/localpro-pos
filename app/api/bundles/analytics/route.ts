import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { Prisma } from '@prisma/client';
import { requireTenantAccess } from '@/lib/api-tenant';
import { hasTenantPermission } from '@/lib/permissions-server';
import { logger } from '@/lib/logger';

/**
 * Get bundle analytics - sales performance metrics
 *
 * NOTE: the original Mongoose `TransactionItem` schema had no `bundleId`
 * field (it was read off the doc as `(item as any).bundleId` but never
 * declared on `TransactionItemSchema`, so Mongoose's default `strict: true`
 * meant it was never actually persisted — this matching logic was already a
 * dead code path in production). The Prisma `TransactionItem` model
 * likewise has no `bundleId` column, so the same (already-inert) matching
 * logic is preserved as-is below for behavioral parity rather than invented.
 */
export async function GET(request: NextRequest) {
  try {
    const { tenantId, user } = await requireTenantAccess(request);

    if (!(await hasTenantPermission(user.role, tenantId, 'bundles.manage'))) {
      return NextResponse.json({ success: false, error: 'Forbidden: Insufficient permissions' }, { status: 403 });
    }

    const searchParams = request.nextUrl.searchParams;
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const bundleId = searchParams.get('bundleId');

    // Build date filter
    const dateFilter: Prisma.DateTimeFilter = {};
    if (startDate) dateFilter.gte = new Date(startDate);
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      dateFilter.lte = end;
    }

    // Get all transactions in the date range
    const transactionWhere: Prisma.TransactionWhereInput = { tenantId, status: 'completed' };
    if (Object.keys(dateFilter).length > 0) {
      transactionWhere.createdAt = dateFilter;
    }

    const transactions = await prisma.transaction.findMany({
      where: transactionWhere,
      select: {
        id: true,
        createdAt: true,
        total: true,
        items: { select: { quantity: true, subtotal: true } },
      },
    });

    // Get all bundles
    const bundleWhere: Prisma.ProductBundleWhereInput = { tenantId };
    if (bundleId) bundleWhere.id = bundleId;
    const bundles = await prisma.productBundle.findMany({
      where: bundleWhere,
      select: { id: true, name: true, price: true },
    });

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
          if (itemBundleId && itemBundleId.toString() === bundle.id.toString()) {
            totalSales += Number(item.subtotal);
            totalQuantity += item.quantity;
            transactionCount++;
          }
        });
      });

      const averageOrderValue = transactionCount > 0 ? totalSales / transactionCount : 0;
      const averageQuantity = transactionCount > 0 ? totalQuantity / transactionCount : 0;

      return {
        bundleId: bundle.id,
        bundleName: bundle.name,
        bundlePrice: bundle.price,
        totalSales,
        totalQuantity,
        transactionCount,
        averageOrderValue,
        averageQuantity,
        revenuePerUnit: totalQuantity > 0 ? totalSales / totalQuantity : Number(bundle.price),
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
            .map((_item: any) => t.id.toString()) // eslint-disable-line @typescript-eslint/no-explicit-any
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
    logger.error('Error fetching bundle analytics:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
