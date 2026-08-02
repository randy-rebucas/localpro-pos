import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireTenantAccess } from '@/lib/api-tenant';
import { handleApiError } from '@/lib/error-handler';
import { customerToApi } from '@/lib/data/customers';
import { getCustomerProfileStats } from '@/lib/data/customers';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireTenantAccess(request);
    if (authResult instanceof NextResponse) return authResult;
    const { tenantId } = authResult;

    const { id } = await params;

    const customer = await prisma.customer.findFirst({ where: { id, tenantId } });
    if (!customer) {
      return NextResponse.json({ success: false, error: 'Customer not found' }, { status: 404 });
    }

    const { recentTransactions, topProducts, loyaltyHistory, orderCount, lifetimeValue, avgOrderValue } =
      await getCustomerProfileStats(tenantId, id);

    // RFM — compute segment
    const now = new Date();
    const daysSinceLastPurchase = customer.lastPurchaseDate
      ? Math.floor((now.getTime() - new Date(customer.lastPurchaseDate).getTime()) / 86400000)
      : null;

    let segment: 'new' | 'regular' | 'vip' | 'at_risk' | 'lapsed' | 'prospect';
    if (orderCount === 0) {
      segment = 'prospect';
    } else if (daysSinceLastPurchase !== null && daysSinceLastPurchase > 90) {
      segment = 'lapsed';
    } else if (daysSinceLastPurchase !== null && daysSinceLastPurchase > 30 && orderCount < 5) {
      segment = 'at_risk';
    } else if (lifetimeValue >= 5000 || (customer.loyaltyPointsBalance ?? 0) >= 500 || orderCount >= 20) {
      segment = 'vip';
    } else if (orderCount <= 2) {
      segment = 'new';
    } else {
      segment = 'regular';
    }

    return NextResponse.json({
      success: true,
      data: {
        customer: customerToApi(customer),
        recentTransactions,
        topProducts,
        loyaltyHistory,
        stats: {
          orderCount,
          lifetimeValue,
          avgOrderValue,
          daysSinceLastPurchase,
          segment,
        },
      },
    });
  } catch (error) {
    return handleApiError(error, 'Failed to fetch customer profile');
  }
}
