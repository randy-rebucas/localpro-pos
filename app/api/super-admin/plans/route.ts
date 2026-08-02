import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireRole } from '@/lib/auth';
import { handleApiError } from '@/lib/error-handler';

function toPlanResponse(plan: {
  id: string;
  priceMonthly: unknown;
  priceSetupFee: unknown;
  priceCurrency: string;
  reactivationFee: unknown;
  yearlyDiscount: unknown;
  [key: string]: unknown;
}) {
  const {
    id,
    priceMonthly,
    priceSetupFee,
    priceCurrency,
    reactivationFee,
    yearlyDiscount,
    ...rest
  } = plan;
  return {
    _id: id,
    ...rest,
    price: {
      monthly: Number(priceMonthly),
      setupFee: Number(priceSetupFee),
      currency: priceCurrency,
    },
    reactivationFee: Number(reactivationFee),
    yearlyDiscount: Number(yearlyDiscount),
  };
}

export async function GET(request: NextRequest) {
  try {
    await requireRole(request, ['super_admin']);

    const plans = await prisma.subscriptionPlan.findMany({
      orderBy: { priceMonthly: 'asc' },
    });

    // Attach active subscriber count to each plan
    const counts = await prisma.subscription.groupBy({
      by: ['planId'],
      where: { status: { in: ['active', 'trial'] } },
      _count: { _all: true },
    });
    const countMap = Object.fromEntries(counts.map(c => [c.planId, c._count._all]));
    const plansWithCounts = plans.map(p => ({
      ...toPlanResponse(p),
      subscriberCount: countMap[p.id] || 0,
    }));

    return NextResponse.json({ success: true, data: plansWithCounts });
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

export async function POST(request: NextRequest) {
  try {
    await requireRole(request, ['super_admin']);

    const body = await request.json();
    const { name, tier, description, price, features, birCompliance, isActive, isCustom, availableToNewTenants, yearlyDiscount } = body;

    if (!name || !tier || price?.monthly === undefined) {
      return NextResponse.json(
        { success: false, error: 'name, tier, and price.monthly are required' },
        { status: 400 }
      );
    }

    const existing = await prisma.subscriptionPlan.findUnique({ where: { tier } });
    if (existing) {
      return NextResponse.json(
        { success: false, error: `A plan with tier '${tier}' already exists` },
        { status: 409 }
      );
    }

    const plan = await prisma.subscriptionPlan.create({
      data: {
        name,
        tier,
        description,
        priceMonthly: price.monthly,
        priceSetupFee: price.setupFee ?? 0,
        priceCurrency: price.currency ?? 'PHP',
        features: features ?? {},
        birCompliance: birCompliance ?? {},
        isActive: isActive !== undefined ? isActive : true,
        isCustom: isCustom || false,
        availableToNewTenants: availableToNewTenants !== undefined ? availableToNewTenants : true,
        yearlyDiscount: yearlyDiscount || 0,
      },
    });

    return NextResponse.json({ success: true, data: toPlanResponse(plan) }, { status: 201 });
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
