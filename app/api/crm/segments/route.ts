import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Customer from '@/models/Customer';
import Transaction from '@/models/Transaction';
import { requireTenantAccess } from '@/lib/api-tenant';
import { handleApiError } from '@/lib/error-handler';
import mongoose from 'mongoose';

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

    // NOTE: tenantId from requireTenantAccess() is a string, but tenantId is
    // stored as ObjectId — aggregate() pipelines don't auto-cast like .find()
    // does, so this must be cast explicitly or $match silently matches nothing.
    const tenantObjectId = new mongoose.Types.ObjectId(tenantId);

    const now = new Date();
    const lapsedCutoff = new Date(now.getTime() - LAPSED_DAYS * 86400000);
    const atRiskCutoff = new Date(now.getTime() - AT_RISK_DAYS * 86400000);

    // Segment rules (evaluated in order, first match wins):
    //   prospect — no completed orders
    //   lapsed   — last purchase older than LAPSED_DAYS
    //   at_risk  — last purchase older than AT_RISK_DAYS and < 5 orders
    //   vip      — spend / points / order-count thresholds
    //   new      — <= 2 orders
    //   regular  — everything else
    // `$type: 'date'` guard: in aggregation a missing/null date compares as
    // less than any Date, which would wrongly mark it lapsed.
    const hasLastBuy = { $eq: [{ $type: '$lastPurchaseDate' }, 'date'] };
    const segmentExpr = {
      $switch: {
        branches: [
          { case: { $eq: ['$_orderCount', 0] }, then: 'prospect' },
          { case: { $and: [hasLastBuy, { $lt: ['$lastPurchaseDate', lapsedCutoff] }] }, then: 'lapsed' },
          {
            case: { $and: [hasLastBuy, { $lt: ['$lastPurchaseDate', atRiskCutoff] }, { $lt: ['$_orderCount', 5] }] },
            then: 'at_risk',
          },
          {
            case: {
              $or: [
                { $gte: ['$_orderSpent', VIP_SPEND_THRESHOLD] },
                { $gte: [{ $ifNull: ['$loyaltyPointsBalance', 0] }, VIP_POINTS_THRESHOLD] },
                { $gte: ['$_orderCount', VIP_ORDERS_THRESHOLD] },
              ],
            },
            then: 'vip',
          },
          { case: { $lte: ['$_orderCount', 2] }, then: 'new' },
        ],
        default: 'regular',
      },
    };

    const segmentMatch = segment === 'all' ? [] : [{ $match: { computedSegment: segment } }];

    // One aggregate instead of loading every customer (and every completed
    // transaction) into memory: per-customer order stats come from an indexed
    // $lookup ({tenantId, customerId, createdAt} on transactions), segments
    // are computed server-side, and only the counts + one page are returned.
    const [facet] = await Customer.aggregate<{
      counts: { _id: string; n: number }[];
      customers: Record<string, unknown>[];
      total: { n: number }[];
    }>([
      { $match: { tenantId: tenantObjectId, isActive: true } },
      {
        $project: {
          _id: 1, firstName: 1, lastName: 1, email: 1, phone: 1,
          lastPurchaseDate: 1, loyaltyPointsBalance: 1, totalSpent: 1, tags: 1,
        },
      },
      {
        $lookup: {
          from: Transaction.collection.collectionName,
          localField: '_id',
          foreignField: 'customerId',
          pipeline: [
            { $match: { tenantId: tenantObjectId, status: 'completed' } },
            { $group: { _id: null, orderCount: { $sum: 1 }, totalSpent: { $sum: '$total' } } },
          ],
          as: '_stats',
        },
      },
      {
        $addFields: {
          _orderCount: { $ifNull: [{ $first: '$_stats.orderCount' }, 0] },
          _orderSpent: { $ifNull: [{ $first: '$_stats.totalSpent' }, 0] },
        },
      },
      { $addFields: { computedSegment: segmentExpr, orderCount: '$_orderCount' } },
      { $project: { _stats: 0, _orderCount: 0, _orderSpent: 0 } },
      {
        $facet: {
          counts: [{ $group: { _id: '$computedSegment', n: { $sum: 1 } } }],
          customers: [...segmentMatch, { $sort: { _id: 1 } }, { $skip: skip }, { $limit: limit }],
          total: [...segmentMatch, { $count: 'n' }],
        },
      },
    ]);

    const counts: Record<string, number> = { all: 0, new: 0, regular: 0, vip: 0, at_risk: 0, lapsed: 0, prospect: 0 };
    for (const { _id, n } of facet?.counts ?? []) {
      counts.all += n;
      counts[_id] = (counts[_id] ?? 0) + n;
    }
    const total = facet?.total?.[0]?.n ?? 0;
    const enriched = facet?.customers ?? [];

    return NextResponse.json({
      success: true,
      data: {
        counts,
        customers: enriched,
        total,
        page,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    return handleApiError(error, 'Failed to fetch CRM segments');
  }
}
