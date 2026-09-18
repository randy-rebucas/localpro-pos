import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireTenantAccess } from '@/lib/api-tenant';
import { hasTenantPermission } from '@/lib/permissions-server';
import { handleApiError } from '@/lib/error-handler';
import { checkFeatureAccess } from '@/lib/subscription';

// Days of history to compute velocity from
const VELOCITY_WINDOW_DAYS = 30;
// Warn if predicted stockout within this many days
const ALERT_HORIZON_DAYS = 14;

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireTenantAccess(request);
    if (authResult instanceof NextResponse) return authResult;
    const { tenantId, user } = authResult;

    if (!(await hasTenantPermission(user.role, tenantId, 'inventory.manage'))) {
      return NextResponse.json({ success: false, error: 'Forbidden: Insufficient permissions' }, { status: 403 });
    }

    // Check if inventory feature is enabled in subscription
    try {
      await checkFeatureAccess(tenantId.toString(), 'enableInventory');
    } catch (featureError: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
      return NextResponse.json(
        { success: false, error: featureError.message },
        { status: 403 }
      );
    }

    const branchId = request.nextUrl.searchParams.get('branchId') || undefined;

    const since = new Date();
    since.setDate(since.getDate() - VELOCITY_WINDOW_DAYS);

    // Aggregate sales quantity per product over the window, scoped to the
    // selected branch when provided so it matches the other branch-scoped
    // panels on the inventory page (LowStockAlerts, RealTimeStockTracker).
    // Prisma's groupBy cannot take abs() of quantity, so we sum in JS —
    // the movement rows for a 30-day window are small per tenant/branch.
    const movements = await prisma.stockMovement.findMany({
      where: {
        tenantId,
        type: 'sale',
        createdAt: { gte: since },
        ...(branchId ? { branchId } : {}),
      },
      select: { productId: true, quantity: true },
    });

    if (movements.length === 0) {
      return NextResponse.json({ success: true, data: [] });
    }

    const salesByProduct = new Map<string, number>();
    for (const m of movements) {
      salesByProduct.set(m.productId, (salesByProduct.get(m.productId) ?? 0) + Math.abs(m.quantity));
    }

    const productIds = Array.from(salesByProduct.keys());

    const products = await prisma.product.findMany({
      where: { id: { in: productIds }, tenantId, isActive: true, trackInventory: true },
      select: {
        id: true,
        name: true,
        stock: true,
        image: true,
        category: true,
        branchStock: branchId ? { where: { branchId } } : true,
      },
    });

    const stockMap = new Map(products.map((p) => [p.id, p]));

    const getStock = (product: (typeof products)[number]) => {
      if (!branchId) return product.stock;
      const branchEntry = product.branchStock?.find((b) => b.branchId === branchId);
      return branchEntry ? branchEntry.stock : product.stock;
    };

    const predictions = Array.from(salesByProduct.entries())
      .map(([productId, totalSold]) => {
        const product = stockMap.get(productId);
        if (!product) return null;

        const currentStock = getStock(product);
        const avgDailySales = totalSold / VELOCITY_WINDOW_DAYS;
        const daysUntilStockout =
          avgDailySales > 0 ? Math.floor(currentStock / avgDailySales) : null;

        return {
          productId,
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
