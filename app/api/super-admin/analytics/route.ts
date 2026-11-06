import { NextRequest, NextResponse } from 'next/server';
import { cacheWrap } from '@/lib/cache';
import { REPORT_MAX_TIME_MS } from '@/lib/query-utils';
import connectDB from '@/lib/mongodb';
import Subscription from '@/models/Subscription';
import '@/models/SubscriptionPlan';
import Transaction from '@/models/Transaction';
import Tenant from '@/models/Tenant';
import { requireRole } from '@/lib/auth';
import { handleApiError } from '@/lib/error-handler';

const PLATFORM_STATS_TTL_MS = 10 * 60 * 1000;

export async function GET(request: NextRequest) {
  try {
    await connectDB();
    await requireRole(request, ['super_admin']);

    const { searchParams } = new URL(request.url);
    const format = searchParams.get('format') || 'json';

    const now = new Date();
    // Support custom date range for revenue/transaction windows
    const rangeStart = searchParams.get('rangeStart')
      ? new Date(searchParams.get('rangeStart')!)
      : new Date(now.getTime() - 30 * 86_400_000);
    const rangeEnd = searchParams.get('rangeEnd')
      ? new Date(searchParams.get('rangeEnd')!)
      : now;

    const thirtyDaysAgo = new Date(now.getTime() - 30 * 86_400_000);
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 86_400_000);

    // Previous period for MoM comparison
    const rangeDays = Math.ceil((rangeEnd.getTime() - rangeStart.getTime()) / 86_400_000);
    const prevStart = new Date(rangeStart.getTime() - rangeDays * 86_400_000);
    const prevEnd = new Date(rangeStart.getTime());

    // ── MRR: sum of active/trial subscriptions × plan monthly price ────────
    const activeSubscriptions = await Subscription.find({
      status: { $in: ['active', 'trial'] },
    }).populate<{ planId: { price: { monthly: number } } | null }>('planId', 'price').lean();

    const mrr = activeSubscriptions.reduce((sum, sub) => {
      const plan = sub.planId as { price: { monthly: number } } | null;
      return sum + (plan?.price?.monthly || 0);
    }, 0);

    // ── Plan distribution ─────────────────────────────────────────────────
    const planCounts = await Subscription.aggregate([
      { $match: { status: { $in: ['active', 'trial'] } } },
      { $group: { _id: '$planId', count: { $sum: 1 } } },
      { $lookup: { from: 'subscriptionplans', localField: '_id', foreignField: '_id', as: 'plan' } },
      { $unwind: { path: '$plan', preserveNullAndEmptyArrays: true } },
      { $project: { tier: { $ifNull: ['$plan.tier', 'unknown'] }, name: { $ifNull: ['$plan.name', 'Unknown'] }, count: 1 } },
      { $sort: { count: -1 } },
    ]);

    // ── Transaction stats ─────────────────────────────────────────────────
    // ── Revenue in custom range + previous period for MoM ────────────────
    // These span every tenant, so no tenant-prefixed index applies — compute all
    // counts and revenue sums in one pass over completed transactions instead of
    // seven separate scans.
    const inRange = (from: Date, to?: Date) => ({
      $cond: [{ $and: [{ $gte: ['$createdAt', from] }, ...(to ? [{ $lte: ['$createdAt', to] }] : [])] }, 1, 0],
    });
    // Keyed on the requested range rather than the computed dates, which move
    // with the clock and would never repeat
    const txStatsKey = `platform:tx-stats:${searchParams.get('rangeStart') ?? ''}:${searchParams.get('rangeEnd') ?? ''}`;
    const [txStats] = await cacheWrap(txStatsKey, PLATFORM_STATS_TTL_MS, () => Transaction.aggregate<{
      txLast30: number; txLast90: number; txTotal: number; txInRange: number; txPrevRange: number;
      revenueInRange: number; revenuePrevRange: number;
    }>([
      { $match: { status: 'completed' } },
      {
        $group: {
          _id: null,
          txLast30: { $sum: inRange(thirtyDaysAgo) },
          txLast90: { $sum: inRange(ninetyDaysAgo) },
          txTotal: { $sum: 1 },
          txInRange: { $sum: inRange(rangeStart, rangeEnd) },
          txPrevRange: { $sum: inRange(prevStart, prevEnd) },
          revenueInRange: { $sum: { $multiply: [inRange(rangeStart, rangeEnd), '$total'] } },
          revenuePrevRange: { $sum: { $multiply: [inRange(prevStart, prevEnd), '$total'] } },
        },
      },
    ]).option({ maxTimeMS: REPORT_MAX_TIME_MS }).exec());
    const txLast30 = txStats?.txLast30 ?? 0;
    const txLast90 = txStats?.txLast90 ?? 0;
    const txTotal = txStats?.txTotal ?? 0;
    const txInRange = txStats?.txInRange ?? 0;
    const txPrevRange = txStats?.txPrevRange ?? 0;
    const revenueLastMonth = txStats?.revenueInRange || 0;
    const revenuePrevPeriod = txStats?.revenuePrevRange || 0;
    const revenueChange = revenuePrevPeriod > 0
      ? ((revenueLastMonth - revenuePrevPeriod) / revenuePrevPeriod) * 100
      : null;

    // ── Tenant growth (last 12 months) ────────────────────────────────────
    const twelveMonthsAgo = new Date(now);
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 11);
    twelveMonthsAgo.setDate(1);
    twelveMonthsAgo.setHours(0, 0, 0, 0);

    const tenantGrowth = await Tenant.aggregate([
      { $match: { createdAt: { $gte: twelveMonthsAgo } } },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' },
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } },
      {
        $project: {
          _id: 0,
          month: {
            $dateToString: {
              format: '%Y-%m',
              date: {
                $dateFromParts: { year: '$_id.year', month: '$_id.month', day: 1 },
              },
            },
          },
          count: 1,
        },
      },
    ]);

    // ── Top 10 tenants by transaction volume ─────────────────────────────
    // All-time scan of every tenant's sales, so reuse it between page loads
    const topTenants = await cacheWrap('platform:top-tenants', PLATFORM_STATS_TTL_MS, () => Transaction.aggregate([
      { $match: { status: 'completed' } },
      { $group: { _id: '$tenantId', txCount: { $sum: 1 }, revenue: { $sum: '$total' } } },
      { $sort: { txCount: -1 } },
      { $limit: 10 },
      { $lookup: { from: 'tenants', localField: '_id', foreignField: '_id', as: 'tenant' } },
      { $unwind: { path: '$tenant', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 0,
          tenantId: '$_id',
          name: { $ifNull: ['$tenant.name', 'Unknown'] },
          slug: { $ifNull: ['$tenant.slug', ''] },
          txCount: 1,
          revenue: 1,
        },
      },
    ]).option({ maxTimeMS: REPORT_MAX_TIME_MS }).exec());

    // ── Subscription status breakdown ─────────────────────────────────────
    const statusBreakdown = await Subscription.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } },
      { $project: { _id: 0, status: '$_id', count: 1 } },
    ]);

    const responseData = {
      mrr,
      revenueLastMonth,
      revenuePrevPeriod,
      revenueChangePct: revenueChange,
      transactions: {
        last30: txLast30,
        last90: txLast90,
        total: txTotal,
        inRange: txInRange,
        prevRange: txPrevRange,
        rangeChangePct: txPrevRange > 0 ? ((txInRange - txPrevRange) / txPrevRange) * 100 : null,
      },
      planBreakdown: planCounts,
      statusBreakdown,
      tenantGrowth,
      topTenants,
      dateRange: { start: rangeStart, end: rangeEnd },
    };

    // CSV export
    if (format === 'csv') {
      const csvRows = [
        'Metric,Value',
        `MRR,${mrr}`,
        `Revenue (period),${revenueLastMonth}`,
        `Revenue (prev period),${revenuePrevPeriod}`,
        `Revenue change %,${revenueChange?.toFixed(2) ?? 'N/A'}`,
        `Transactions (30d),${txLast30}`,
        `Transactions (90d),${txLast90}`,
        `Transactions (total),${txTotal}`,
        '',
        'Plan,Tier,Subscribers',
        ...planCounts.map((p: { name: string; tier: string; count: number }) => `${p.name},${p.tier},${p.count}`),
        '',
        'Status,Count',
        ...statusBreakdown.map((s: { status: string; count: number }) => `${s.status},${s.count}`),
        '',
        'Tenant,Slug,Transactions,Revenue',
        ...topTenants.map((t: { name: string; slug: string; txCount: number; revenue: number }) =>
          `"${t.name}",${t.slug},${t.txCount},${t.revenue}`),
      ].join('\n');

      return new NextResponse(csvRows, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="analytics-${new Date().toISOString().slice(0, 10)}.csv"`,
        },
      });
    }

    return NextResponse.json({ success: true, data: responseData });
  } catch (error: unknown) {
    if (error instanceof Error && (error.message === 'Unauthorized' || error.message.includes('Forbidden'))) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.message === 'Unauthorized' ? 401 : 403 }
      );
    }
    return handleApiError(error);
  }
}
