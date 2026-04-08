import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import CommissionRule from '@/models/CommissionRule';
import { requireTenantAccess } from '@/lib/api-tenant';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { handleApiError } from '@/lib/error-handler';

export async function GET(request: NextRequest) {
  try {
    await connectDB();
    const { tenantId } = await requireTenantAccess(request);
    const rules = await CommissionRule.find({ tenantId }).sort({ createdAt: -1 }).lean();
    return NextResponse.json({ success: true, data: rules });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    return handleApiError(error, 'Failed to list commission rules');
  }
}

export async function POST(request: NextRequest) {
  try {
    await connectDB();
    const { tenantId, user } = await requireTenantAccess(request);
    const userId = user.userId;
    const body = await request.json();
    const { name, type, rate, tiers, staffIds, productCategories, minimumSale } = body;

    if (!name?.trim() || !type) {
      return NextResponse.json({ success: false, error: 'name and type are required' }, { status: 400 });
    }
    if (type === 'percentage' || type === 'flat') {
      if (rate === undefined || rate < 0) {
        return NextResponse.json({ success: false, error: 'rate is required for percentage/flat types' }, { status: 400 });
      }
    }
    if (type === 'tiered' && (!tiers || !tiers.length)) {
      return NextResponse.json({ success: false, error: 'tiers are required for tiered type' }, { status: 400 });
    }

    const rule = await CommissionRule.create({
      tenantId,
      name: name.trim(),
      type,
      rate,
      tiers,
      staffIds: staffIds || [],
      productCategories: productCategories || [],
      minimumSale: minimumSale || 0,
      createdBy: userId,
    });

    await createAuditLog(request, {
      tenantId,
      action: AuditActions.CREATE,
      entityType: 'commission_rule',
      entityId: rule._id.toString(),
      metadata: { name, type },
    });

    return NextResponse.json({ success: true, data: rule }, { status: 201 });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    return handleApiError(error, 'Failed to create commission rule');
  }
}
