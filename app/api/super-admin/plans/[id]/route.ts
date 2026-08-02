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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole(request, ['super_admin']);

    const { id } = await params;
    const plan = await prisma.subscriptionPlan.findUnique({ where: { id } });
    if (!plan) {
      return NextResponse.json({ success: false, error: 'Plan not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: toPlanResponse(plan) });
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

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole(request, ['super_admin']);

    const { id } = await params;
    const body = await request.json();

    const existing = await prisma.subscriptionPlan.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ success: false, error: 'Plan not found' }, { status: 404 });
    }

    const {
      price,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      _id,
      ...rest
    } = body;

    const data: Record<string, unknown> = { ...rest };
    if (price !== undefined) {
      if (price.monthly !== undefined) data.priceMonthly = price.monthly;
      if (price.setupFee !== undefined) data.priceSetupFee = price.setupFee;
      if (price.currency !== undefined) data.priceCurrency = price.currency;
    }

    const plan = await prisma.subscriptionPlan.update({
      where: { id },
      data,
    });

    return NextResponse.json({ success: true, data: toPlanResponse(plan) });
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

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole(request, ['super_admin']);

    const { id } = await params;
    const plan = await prisma.subscriptionPlan.findUnique({ where: { id } });
    if (!plan) {
      return NextResponse.json({ success: false, error: 'Plan not found' }, { status: 404 });
    }

    // Check for active/trial subscriptions referencing this plan
    const activeCount = await prisma.subscription.count({
      where: {
        planId: id,
        status: { in: ['active', 'trial'] },
      },
    });

    if (activeCount > 0) {
      // Soft-delete: mark inactive instead of hard delete
      const updated = await prisma.subscriptionPlan.update({
        where: { id },
        data: { isActive: false },
      });
      return NextResponse.json({
        success: true,
        data: toPlanResponse(updated),
        message: `Plan deactivated (${activeCount} active subscription(s) reference it). Hard delete blocked.`,
      });
    }

    await prisma.subscriptionPlan.delete({ where: { id } });
    return NextResponse.json({ success: true, message: 'Plan deleted' });
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
