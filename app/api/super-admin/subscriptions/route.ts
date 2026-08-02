import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireRole } from '@/lib/auth';
import { handleApiError } from '@/lib/error-handler';
import { getTenantBySlugAny } from '@/lib/data/tenants';
import type { Prisma } from '@prisma/client';

export async function GET(request: NextRequest) {
  try {
    await requireRole(request, ['super_admin']);

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') || '';
    const tenantSlug = searchParams.get('tenantSlug') || '';
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '50')));

    // Build query
    const where: Prisma.SubscriptionWhereInput = {};
    if (status) where.status = status as Prisma.SubscriptionWhereInput['status'];

    // If filtering by tenantSlug, resolve tenantId first
    if (tenantSlug) {
      const tenant = await getTenantBySlugAny(tenantSlug);
      if (tenant) {
        where.tenantId = tenant.id;
      } else {
        return NextResponse.json({ success: true, data: [], pagination: { page, limit, total: 0, pages: 0 } });
      }
    }

    const [subscriptions, total] = await Promise.all([
      prisma.subscription.findMany({
        where,
        include: {
          tenant: { select: { id: true, slug: true, name: true } },
          plan: { select: { id: true, name: true, tier: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.subscription.count({ where }),
    ]);

    const data = subscriptions.map((sub) => {
      const { id, outstandingBalance, tenant, plan, ...rest } = sub;
      return {
        _id: id,
        ...rest,
        outstandingBalance: Number(outstandingBalance),
        tenantId: tenant ? { _id: tenant.id, slug: tenant.slug, name: tenant.name } : null,
        planId: plan ? { _id: plan.id, name: plan.name, tier: plan.tier } : null,
      };
    });

    return NextResponse.json({
      success: true,
      data,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
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
