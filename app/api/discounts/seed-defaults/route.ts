import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { requireTenantAccess } from '@/lib/api-tenant';
import { requireRole } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { ensureLegalDiscounts } from '@/lib/discount-seeds';

export async function POST(request: NextRequest) {
  try {
    await connectDB();
    await requireRole(request, ['cashier', 'manager', 'admin', 'owner']);
    const authResult = await requireTenantAccess(request);
    if (authResult instanceof NextResponse) return authResult;
    const tenantId = authResult.tenantId;

    await ensureLegalDiscounts(tenantId);

    return NextResponse.json({
      success: true,
      message: 'Legal discounts (SC20, PWD20) ensured for this tenant.',
    });
  } catch (error: unknown) {
    logger.error('Error seeding default discounts:', error);
    return NextResponse.json({ success: false, error: 'Failed to seed discounts' }, { status: 500 });
  }
}
