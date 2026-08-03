import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getTenantIdFromRequest } from '@/lib/api-tenant';
import { logger } from '@/lib/logger';

/**
 * Get bundle analytics - sales performance metrics
 *
 * TODO: There is no first-class way to mark "this line item was sold as part
 * of bundle X" on a transaction item — the Prisma TransactionItem model
 * (prisma/schema.prisma) has no `bundleId` column.
 * As a best-effort substitute, a transaction item is attributed to a bundle if its
 * productId matches one of that bundle's component products. This is an approximation:
 * a product sold standalone (not as part of a bundle) will also be counted here if it
 * happens to also be a bundle component. If precise bundle-attribution is needed, add a
 * `bundleId` column to TransactionItem and stamp it at checkout time.
 */
export async function GET(request: NextRequest) {
  try {
    const tenantId = await getTenantIdFromRequest(request);

    if (!tenantId) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    const searchParams = request.nextUrl.searchParams;
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const bundleId = searchParams.get('bundleId');

    const createdAt: { gte?: Date; lte?: Date } = {};
    if (startDate) createdAt.gte = new Date(startDate);
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      createdAt.lte = end;
    }

    const bundles = await prisma.productBundle.findMany({
      where: { tenantId, ...(bundleId ? { id: bundleId } : {}) },
      select: {
        id: true,
        name: true,
        price: true,
        items: { select: { productId: true } },
      },
    });

    const allProductIds = [...new Set(bundles.flatMap((b) => b.items.map((i) => i.productId)))];

    const transactionItems = allProductIds.length
      ? await prisma.transactionItem.findMany({
          where: {
            productId: { in: allProductIds },
            transaction: {
              tenantId,
              status: 'completed',
              ...(Object.keys(createdAt).length ? { createdAt } : {}),
            },
          },
          select: { productId: true, transactionId: true, quantity: true, subtotal: true },
        })
      : [];

    const itemsByProduct = new Map<string, typeof transactionItems>();
    for (const item of transactionItems) {
      if (!item.productId) continue;
      const list = itemsByProduct.get(item.productId) ?? [];
      list.push(item);
      itemsByProduct.set(item.productId, list);
    }

    const bundleTransactionIds = new Set<string>();

    const analytics = bundles.map((bundle) => {
      let totalSales = 0;
      let totalQuantity = 0;
      let transactionCount = 0;

      for (const bundleItem of bundle.items) {
        const items = itemsByProduct.get(bundleItem.productId) ?? [];
        for (const item of items) {
          totalSales += Number(item.subtotal);
          totalQuantity += item.quantity;
          transactionCount++;
          bundleTransactionIds.add(item.transactionId);
        }
      }

      const averageOrderValue = transactionCount > 0 ? totalSales / transactionCount : 0;
      const averageQuantity = transactionCount > 0 ? totalQuantity / transactionCount : 0;

      return {
        bundleId: bundle.id,
        bundleName: bundle.name,
        bundlePrice: Number(bundle.price),
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
      totalTransactions: bundleTransactionIds.size,
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
