import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import StockMovement from '@/models/StockMovement';
import Product from '@/models/Product';
import { requireTenantAccess } from '@/lib/api-tenant';
import { handleApiError } from '@/lib/error-handler';

// Days of history to compute velocity from
const VELOCITY_WINDOW_DAYS = 30;
// Warn if predicted stockout within this many days
const ALERT_HORIZON_DAYS = 14;

export async function GET(request: NextRequest) {
  try {
    await connectDB();

    const authResult = await requireTenantAccess(request);
    if (authResult instanceof NextResponse) return authResult;
    const { tenantId } = authResult;

    const branchId = request.nextUrl.searchParams.get('branchId') || undefined;

    const since = new Date();
    since.setDate(since.getDate() - VELOCITY_WINDOW_DAYS);

    // Aggregate sales quantity per product over the window, scoped to the
    // selected branch when provided so it matches the other branch-scoped
    // panels on the inventory page (LowStockAlerts, RealTimeStockTracker).
    const salesMatch: Record<string, unknown> = {
      tenantId,
      type: 'sale',
      createdAt: { $gte: since },
    };
    if (branchId) salesMatch.branchId = branchId;

    const salesByProduct = await StockMovement.aggregate([
      { $match: salesMatch },
      {
        $group: {
          _id: '$productId',
          totalSold: { $sum: { $abs: '$quantity' } },
        },
      },
    ]);

    if (salesByProduct.length === 0) {
      return NextResponse.json({ success: true, data: [] });
    }

    const productIds = salesByProduct.map((s) => s._id);

    const products = await Product.find(
      { _id: { $in: productIds }, tenantId, isActive: { $ne: false }, trackInventory: { $ne: false } },
      { _id: 1, name: 1, stock: 1, image: 1, category: 1, branchStock: 1 }
    ).lean();

    const stockMap = new Map(products.map((p) => [String(p._id), p]));

    const getStock = (product: (typeof products)[number]) => {
      if (!branchId) return product.stock;
      const branchEntry = product.branchStock?.find((b) => String(b.branchId) === branchId);
      return branchEntry ? branchEntry.stock : product.stock;
    };

    const predictions = salesByProduct
      .map((s) => {
        const product = stockMap.get(String(s._id));
        if (!product) return null;

        const currentStock = getStock(product);
        const avgDailySales = s.totalSold / VELOCITY_WINDOW_DAYS;
        const daysUntilStockout =
          avgDailySales > 0 ? Math.floor(currentStock / avgDailySales) : null;

        return {
          productId: String(s._id),
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
