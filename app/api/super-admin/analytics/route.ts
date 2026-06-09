import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Subscription from '@/models/Subscription';
import '@/models/SubscriptionPlan';
import Transaction from '@/models/Transaction';
import Tenant from '@/models/Tenant';
import { requireRole } from '@/lib/auth';
import { handleApiError } from '@/lib/error-handler';

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
    const [txLast30, txLast90, txTotal, txInRange, txPrevRange] = await Promise.all([
      Transaction.countDocuments({ status: 'completed', createdAt: { $gte: thirtyDaysAgo } }),
      Transaction.countDocuments({ status: 'completed', createdAt: { $gte: ninetyDaysAgo } }),
      Transaction.countDocuments({ status: 'completed' }),
      Transaction.countDocuments({ status: 'completed', createdAt: { $gte: rangeStart, $lte: rangeEnd } }),
      Transaction.countDocuments({ status: 'completed', createdAt: { $gte: prevStart, $lte: prevEnd } }),
    ]);

    // ── Revenue in custom range + previous period for MoM ────────────────
    const [revenueAgg, revenuePrevAgg] = await Promise.all([
      Transaction.aggregate([
        { $match: { status: 'completed', createdAt: { $gte: rangeStart, $lte: rangeEnd } } },
        { $group: { _id: null, total: { $sum: '$total' } } },
      ]),
      Transaction.aggregate([
        { $match: { status: 'completed', createdAt: { $gte: prevStart, $lte: prevEnd } } },
        { $group: { _id: null, total: { $sum: '$total' } } },
      ]),
    ]);
    const revenueLastMonth = revenueAgg[0]?.total || 0;
    const revenuePrevPeriod = revenuePrevAgg[0]?.total || 0;
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
    const topTenants = await Transaction.aggregate([
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
    ]);

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
