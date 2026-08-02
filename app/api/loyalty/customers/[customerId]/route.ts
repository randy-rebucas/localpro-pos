import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getTenantIdFromRequest } from '@/lib/api-tenant';
import { getCurrentUser } from '@/lib/auth';
import { checkFeatureAccess } from '@/lib/subscription';
import { handleApiError } from '@/lib/error-handler';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ customerId: string }> }
) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const tenantId = await getTenantIdFromRequest(request);
    if (!tenantId) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    try {
      await checkFeatureAccess(tenantId.toString(), 'enableLoyaltyProgram');
    } catch (featureError: unknown) {
      return NextResponse.json(
        { success: false, error: (featureError as Error).message },
        { status: 403 }
      );
    }

    const { customerId } = await params;

    const customer = await prisma.customer.findFirst({ where: { id: customerId, tenantId } });
    if (!customer) {
      return NextResponse.json({ success: false, error: 'Customer not found' }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const rawLimit = parseInt(searchParams.get('limit') || '20');
    const limit = Math.min(Math.max(1, rawLimit), 100);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const skip = (page - 1) * limit;

    const [history, total] = await Promise.all([
      prisma.loyaltyTransaction.findMany({
        where: { tenantId, customerId },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip,
      }),
      prisma.loyaltyTransaction.count({ where: { tenantId, customerId } }),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        customerId,
        customerName: `${customer.firstName} ${customer.lastName}`,
        loyaltyPointsBalance: customer.loyaltyPointsBalance ?? 0,
        history: history.map(({ id, ...rest }) => ({ _id: id, ...rest })),
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    return handleApiError(error, 'Failed to fetch customer loyalty data');
  }
}
