import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { handleApiError } from '@/lib/error-handler';

export async function GET(request: NextRequest) {
  try {
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
    const activeSubscriptions = await prisma.subscription.findMany({
      where: { status: { in: ['active', 'trial'] } },
      select: { plan: { select: { priceMonthly: true } } },
    });

    const mrr = activeSubscriptions.reduce((sum, sub) => {
      return sum + Number(sub.plan?.priceMonthly || 0);
    }, 0);

    // ── Plan distribution ─────────────────────────────────────────────────
    const planGroups = await prisma.subscription.groupBy({
      by: ['planId'],
      where: { status: { in: ['active', 'trial'] } },
      _count: { _all: true },
    });
    const planIds = planGroups.map((g) => g.planId);
    const plans = await prisma.subscriptionPlan.findMany({
      where: { id: { in: planIds } },
      select: { id: true, tier: true, name: true },
    });
    const planById = new Map(plans.map((p) => [p.id, p]));
    const planCounts = planGroups
      .map((g) => ({
        tier: planById.get(g.planId)?.tier || 'unknown',
        name: planById.get(g.planId)?.name || 'Unknown',
        count: g._count._all,
      }))
      .sort((a, b) => b.count - a.count);

    // ── Transaction stats ─────────────────────────────────────────────────
    const [txLast30, txLast90, txTotal, txInRange, txPrevRange] = await Promise.all([
      prisma.transaction.count({ where: { status: 'completed', createdAt: { gte: thirtyDaysAgo } } }),
      prisma.transaction.count({ where: { status: 'completed', createdAt: { gte: ninetyDaysAgo } } }),
      prisma.transaction.count({ where: { status: 'completed' } }),
      prisma.transaction.count({ where: { status: 'completed', createdAt: { gte: rangeStart, lte: rangeEnd } } }),
      prisma.transaction.count({ where: { status: 'completed', createdAt: { gte: prevStart, lte: prevEnd } } }),
    ]);

    // ── Revenue in custom range + previous period for MoM ────────────────
    const [revenueAgg, revenuePrevAgg] = await Promise.all([
      prisma.transaction.aggregate({
        where: { status: 'completed', createdAt: { gte: rangeStart, lte: rangeEnd } },
        _sum: { total: true },
      }),
      prisma.transaction.aggregate({
        where: { status: 'completed', createdAt: { gte: prevStart, lte: prevEnd } },
        _sum: { total: true },
      }),
    ]);
    const revenueLastMonth = Number(revenueAgg._sum.total || 0);
    const revenuePrevPeriod = Number(revenuePrevAgg._sum.total || 0);
    const revenueChange = revenuePrevPeriod > 0
      ? ((revenueLastMonth - revenuePrevPeriod) / revenuePrevPeriod) * 100
      : null;

    // ── Tenant growth (last 12 months) ────────────────────────────────────
    const twelveMonthsAgo = new Date(now);
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 11);
    twelveMonthsAgo.setDate(1);
    twelveMonthsAgo.setHours(0, 0, 0, 0);

    const newTenants = await prisma.tenant.findMany({
      where: { createdAt: { gte: twelveMonthsAgo } },
      select: { createdAt: true },
    });
    const growthByMonth = new Map<string, number>();
    for (const t of newTenants) {
      const key = `${t.createdAt.getFullYear()}-${String(t.createdAt.getMonth() + 1).padStart(2, '0')}`;
      growthByMonth.set(key, (growthByMonth.get(key) || 0) + 1);
    }
    const tenantGrowth = Array.from(growthByMonth.entries())
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([month, count]) => ({ month, count }));

    // ── Top 10 tenants by transaction volume ─────────────────────────────
    const txGroups = await prisma.transaction.groupBy({
      by: ['tenantId'],
      where: { status: 'completed' },
      _count: { _all: true },
      _sum: { total: true },
      orderBy: { _count: { tenantId: 'desc' } },
      take: 10,
    });
    const tenantIds = txGroups.map((g) => g.tenantId);
    const tenants = await prisma.tenant.findMany({
      where: { id: { in: tenantIds } },
      select: { id: true, name: true, slug: true },
    });
    const tenantById = new Map(tenants.map((t) => [t.id, t]));
    const topTenants = txGroups
      .map((g) => ({
        tenantId: g.tenantId,
        name: tenantById.get(g.tenantId)?.name || 'Unknown',
        slug: tenantById.get(g.tenantId)?.slug || '',
        txCount: g._count._all,
        revenue: Number(g._sum.total || 0),
      }))
      .sort((a, b) => b.txCount - a.txCount);

    // ── Subscription status breakdown ─────────────────────────────────────
    const statusGroups = await prisma.subscription.groupBy({
      by: ['status'],
      _count: { _all: true },
    });
    const statusBreakdown = statusGroups.map((g) => ({ status: g.status, count: g._count._all }));

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
