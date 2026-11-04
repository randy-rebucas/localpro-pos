import { NextRequest, NextResponse } from 'next/server';
import { getRepos, runInTransaction } from '@/lib/db';
import { getTenantIdFromRequest } from '@/lib/api-tenant';
import { getCurrentUser } from '@/lib/auth';
import { hasTenantPermission } from '@/lib/permissions-server';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { checkFeatureAccess } from '@/lib/subscription';
import { checkRateLimit } from '@/lib/rate-limit';
import { handleApiError } from '@/lib/error-handler';

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const tenantId = await getTenantIdFromRequest(request);
    if (!tenantId) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    if (!(await hasTenantPermission(user.role, tenantId, 'loyalty.adjust'))) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    try {
      await checkFeatureAccess(tenantId.toString(), 'enableLoyaltyProgram');
    } catch (featureError: unknown) {
      return NextResponse.json(
        { success: false, error: (featureError as Error).message },
        { status: 403 }
      );
    }

    const ip = request.headers.get('x-forwarded-for') ?? 'unknown';
    const { allowed } = checkRateLimit(`write:loyalty-adjust:${tenantId}:${ip}`, 10, 60_000);
    if (!allowed) {
      return NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429 });
    }

    const body = await request.json();
    const { customerId, points, description } = body;

    if (!customerId) {
      return NextResponse.json({ success: false, error: 'customerId is required' }, { status: 400 });
    }
    if (typeof points !== 'number' || points === 0) {
      return NextResponse.json({ success: false, error: 'points must be a non-zero number' }, { status: 400 });
    }
    if (!description || typeof description !== 'string' || !description.trim()) {
      return NextResponse.json({ success: false, error: 'description is required' }, { status: 400 });
    }

    const { customers, loyaltyTransactions } = getRepos();
    const customer = await customers.findById(tenantId, customerId);
    if (!customer) {
      return NextResponse.json({ success: false, error: 'Customer not found' }, { status: 404 });
    }

    const balanceBefore = customer.loyaltyPointsBalance ?? 0;
    const balanceAfter = Math.max(0, balanceBefore + points);

    // The balance and its ledger entry land together or not at all
    const loyaltyTx = await runInTransaction(async (tx) => {
      await customers.update(tenantId, customerId, { loyaltyPointsBalance: balanceAfter }, { tx });
      return loyaltyTransactions.create(
        tenantId,
        {
          customerId: customer._id,
          type: 'adjust',
          points,
          balanceBefore,
          balanceAfter,
          description: description.trim(),
          createdBy: user.userId,
        },
        { tx }
      );
    });

    await createAuditLog(request, {
      tenantId: tenantId.toString(),
      userId: user.userId,
      action: AuditActions.UPDATE,
      entityType: 'loyalty_adjust',
      entityId: loyaltyTx._id,
      changes: { customerId, points, balanceBefore, balanceAfter, description },
    });

    return NextResponse.json({
      success: true,
      data: {
        customerId,
        balanceBefore,
        balanceAfter,
        pointsAdjusted: points,
        loyaltyTransactionId: loyaltyTx._id,
      },
    });
  } catch (error) {
    return handleApiError(error, 'Failed to adjust loyalty points');
  }
}
