import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { getRepos } from '@/lib/db';
import Transaction from '@/models/Transaction';
import { requireTenantAccess } from '@/lib/api-tenant';
import { handleApiError } from '@/lib/error-handler';
import mongoose from 'mongoose';
import { cacheWrap, TTL } from '@/lib/cache';

// RFM thresholds
const VIP_SPEND_THRESHOLD = 5000;
const VIP_ORDERS_THRESHOLD = 20;
const VIP_POINTS_THRESHOLD = 500;
const LAPSED_DAYS = 90;
const AT_RISK_DAYS = 30;

export async function GET(request: NextRequest) {
  try {
    await connectDB();

    const authResult = await requireTenantAccess(request);
    if (authResult instanceof NextResponse) return authResult;
    const { tenantId } = authResult;

    const searchParams = request.nextUrl.searchParams;
    const segment = searchParams.get('segment') ?? 'all';
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1'));
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') ?? '20')));
    const skip = (page - 1) * limit;

    // Get order counts per customer
    // NOTE: tenantId from requireTenantAccess() is a string, but Transaction.tenantId
    // is stored as ObjectId — aggregate() pipelines don't auto-cast like .find() does,
    // so this must be cast explicitly or the $match silently matches nothing.
    const tenantObjectId = new mongoose.Types.ObjectId(tenantId);
    // All-time stats per customer: only sales with a customer attached (most POS
    // sales are anonymous) so the { tenantId, customerId, createdAt } index can
    // narrow the scan, and cached 5 min per tenant since every segment tab and
    // page change re-requests them.
    const orderStats = await cacheWrap(`crm:orderstats:${tenantId}`, TTL.LONG, () =>
      Transaction.aggregate<{ _id: mongoose.Types.ObjectId | null; orderCount: number; totalSpent: number }>([
        { $match: { tenantId: tenantObjectId, customerId: { $ne: null }, status: 'completed' } },
        {
          $group: {
            _id: '$customerId',
            orderCount: { $sum: 1 },
            totalSpent: { $sum: '$total' },
          },
        },
      ])
    );

    const orderMap = new Map<string, { orderCount: number; totalSpent: number }>(
      orderStats
        .filter((s) => s._id != null)
        .map((s) => [String(s._id), { orderCount: s.orderCount, totalSpent: s.totalSpent }])
    );

    const now = new Date();
    const lapsedCutoff = new Date(now.getTime() - LAPSED_DAYS * 86400000);
    const atRiskCutoff = new Date(now.getTime() - AT_RISK_DAYS * 86400000);

    // Classify each customer
    const classifySegment = (c: {
      _id: string;
      lastPurchaseDate?: Date;
      loyaltyPointsBalance?: number;
    }): string => {
      const stats = orderMap.get(String(c._id));
      const orderCount = stats?.orderCount ?? 0;
      const totalSpent = stats?.totalSpent ?? 0;
      const lp = c.loyaltyPointsBalance ?? 0;
      const lastBuy = c.lastPurchaseDate ? new Date(c.lastPurchaseDate) : null;

      if (orderCount === 0) return 'prospect';
      if (lastBuy && lastBuy < lapsedCutoff) return 'lapsed';
      if (lastBuy && lastBuy < atRiskCutoff && orderCount < 5) return 'at_risk';
      if (totalSpent >= VIP_SPEND_THRESHOLD || lp >= VIP_POINTS_THRESHOLD || orderCount >= VIP_ORDERS_THRESHOLD) return 'vip';
      if (orderCount <= 2) return 'new';
      return 'regular';
    };

    // Fetch all active customers (for counts)
    const allCustomers = await getRepos().customers.list(
      tenantId,
      { isActive: true },
      { select: '_id firstName lastName email phone lastPurchaseDate loyaltyPointsBalance totalSpent tags' }
    );

    // Compute segment counts
    const counts: Record<string, number> = { all: 0, new: 0, regular: 0, vip: 0, at_risk: 0, lapsed: 0, prospect: 0 };
    const segmentedMap = new Map<string, typeof allCustomers>();

    for (const c of allCustomers) {
      const seg = classifySegment(c as Parameters<typeof classifySegment>[0]);
      counts.all++;
      counts[seg] = (counts[seg] ?? 0) + 1;
      const arr = segmentedMap.get(seg) ?? [];
      arr.push(c);
      segmentedMap.set(seg, arr);
    }

    // Get requested page of customers in segment
    let filtered: typeof allCustomers;
    if (segment === 'all') {
      filtered = allCustomers;
    } else {
      filtered = segmentedMap.get(segment) ?? [];
    }

    // Enrich with computed orderCount
    const enriched = filtered.slice(skip, skip + limit).map((c) => ({
      ...c,
      orderCount: orderMap.get(String(c._id))?.orderCount ?? 0,
      computedSegment: classifySegment(c as Parameters<typeof classifySegment>[0]),
    }));

    return NextResponse.json({
      success: true,
      data: {
        counts,
        customers: enriched,
        total: filtered.length,
        page,
        totalPages: Math.ceil(filtered.length / limit),
      },
    });
  } catch (error) {
    return handleApiError(error, 'Failed to fetch CRM segments');
  }
}
