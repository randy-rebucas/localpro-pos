import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireTenantAccess } from '@/lib/api-tenant';
import { handleApiError } from '@/lib/error-handler';

// Days of history to compute velocity from
const VELOCITY_WINDOW_DAYS = 30;
// Warn if predicted stockout within this many days
const ALERT_HORIZON_DAYS = 14;

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireTenantAccess(request);
    if (authResult instanceof NextResponse) return authResult;
    const { tenantId } = authResult;

    const branchId = request.nextUrl.searchParams.get('branchId') || undefined;

    const since = new Date();
    since.setDate(since.getDate() - VELOCITY_WINDOW_DAYS);

    const salesByProduct = await prisma.stockMovement.groupBy({
      by: ['productId'],
      where: {
        tenantId,
        type: 'sale',
        createdAt: { gte: since },
        ...(branchId ? { branchId } : {}),
      },
      _sum: { quantity: true },
    });

    if (salesByProduct.length === 0) {
      return NextResponse.json({ success: true, data: [] });
    }

    const productIds = salesByProduct
      .map((s) => s.productId)
      .filter((id): id is string => Boolean(id));

    const products = await prisma.product.findMany({
      where: { id: { in: productIds }, tenantId, isActive: true, trackInventory: true },
      select: {
        id: true,
        name: true,
        stock: true,
        image: true,
        category: true,
        branchStock: branchId ? { where: { branchId } } : false,
      },
    });

    const stockMap = new Map(products.map((p) => [p.id, p]));

    const getStock = (product: (typeof products)[number]) => {
      if (!branchId) return Number(product.stock);
      const branchEntry = product.branchStock?.[0];
      return branchEntry ? branchEntry.stock : Number(product.stock);
    };

    const predictions = salesByProduct
      .map((s) => {
        if (!s.productId) return null;
        const product = stockMap.get(s.productId);
        if (!product) return null;

        const currentStock = getStock(product);
        const totalSold = Math.abs(s._sum?.quantity ?? 0);
        const avgDailySales = totalSold / VELOCITY_WINDOW_DAYS;
        const daysUntilStockout =
          avgDailySales > 0 ? Math.floor(currentStock / avgDailySales) : null;

        return {
          productId: s.productId,
          name: product.name,
          image: product.image ?? null,
          category: product.category ?? null,
          currentStock,
          avgDailySales: Math.round(avgDailySales * 10) / 10,
          daysUntilStockout,
        };
      })
      .filter(
        (p): p is NonNullable<typeof p> =>
          p !== null &&
          p.daysUntilStockout !== null &&
          p.daysUntilStockout <= ALERT_HORIZON_DAYS &&
          p.currentStock > 0
      )
      .sort((a, b) => (a.daysUntilStockout ?? 999) - (b.daysUntilStockout ?? 999));

    return NextResponse.json({ success: true, data: predictions });
  } catch (error) {
    return handleApiError(error, 'Failed to fetch stock predictions');
  }
}
