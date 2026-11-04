import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Transaction from '@/models/Transaction';
import { getRepos } from '@/lib/db';
import { requireTenantAccess } from '@/lib/api-tenant';
import { handleApiError } from '@/lib/error-handler';
import mongoose from 'mongoose';

const HISTORY_DAYS = 90;
const MAX_SUGGESTIONS = 5;

export async function GET(request: NextRequest) {
  try {
    // Transaction is not behind the repository layer yet
    await connectDB();

    const authResult = await requireTenantAccess(request);
    if (authResult instanceof NextResponse) return authResult;
    const { tenantId } = authResult;

    const searchParams = request.nextUrl.searchParams;
    const productIdsParam = searchParams.get('productIds') ?? '';

    if (!productIdsParam) {
      return NextResponse.json({ success: true, data: [] });
    }

    const cartProductIds = productIdsParam
      .split(',')
      .filter(Boolean)
      .map((id) => {
        try { return new mongoose.Types.ObjectId(id); } catch { return null; }
      })
      .filter((id): id is mongoose.Types.ObjectId => id !== null);

    if (cartProductIds.length === 0) {
      return NextResponse.json({ success: true, data: [] });
    }

    const since = new Date();
    since.setDate(since.getDate() - HISTORY_DAYS);

    // Find transactions that contain at least one cart product
    const coOccurrences = await Transaction.aggregate([
      {
        $match: {
          tenantId,
          status: 'completed',
          createdAt: { $gte: since },
          'items.product': { $in: cartProductIds },
        },
      },
      // Flatten items
      { $unwind: '$items' },
      // Keep only items NOT in the cart
      {
        $match: {
          'items.product': { $nin: cartProductIds, $ne: null },
        },
      },
      // Count co-occurrence frequency per product
      {
        $group: {
          _id: '$items.product',
          score: { $sum: 1 },
        },
      },
      { $sort: { score: -1 } },
      { $limit: MAX_SUGGESTIONS * 2 }, // fetch extras to filter out-of-stock
    ]);

    if (coOccurrences.length === 0) {
      return NextResponse.json({ success: true, data: [] });
    }

    const suggestedIds = coOccurrences.map((c) => String(c._id));
    const scoreMap = new Map<string, number>(
      coOccurrences.map((c) => [String(c._id), c.score])
    );

    const suggestedProducts = await getRepos().products.list(
      tenantId,
      { ids: suggestedIds, active: true, sellable: true },
      { select: '_id name price stock image category' }
    );

    const sorted = suggestedProducts
      .sort((a, b) => (scoreMap.get(String(b._id)) ?? 0) - (scoreMap.get(String(a._id)) ?? 0))
      .slice(0, MAX_SUGGESTIONS)
      .map((p) => ({
        productId: String(p._id),
        name: p.name,
        price: p.price,
        stock: p.stock,
        image: p.image ?? null,
        category: p.category ?? null,
        score: scoreMap.get(String(p._id)) ?? 0,
      }));

    return NextResponse.json({ success: true, data: sorted });
  } catch (error) {
    return handleApiError(error, 'Failed to fetch upsell suggestions');
  }
}
