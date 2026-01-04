import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import TaxRule from '@/models/TaxRule';
import { getTenantIdFromRequest } from '@/lib/api-tenant';
import { requireAuth } from '@/lib/auth';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';

export async function GET(request: NextRequest) {
  try {
    await connectDB();
    const tenantId = await getTenantIdFromRequest(request);
    
    if (!tenantId) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }
    
    const searchParams = request.nextUrl.searchParams;
    const isActive = searchParams.get('isActive');
    
    const query: Record<string, unknown> = { tenantId };
    if (isActive !== null) {
      query.isActive = isActive === 'true';
    }
    
    const taxRules = await TaxRule.find(query)
      .sort({ priority: -1, createdAt: -1 })
      .lean();
    
    return NextResponse.json({ success: true, data: taxRules });
  } catch (error: unknown) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await connectDB();
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const _user = await requireAuth(request);
    const tenantId = await getTenantIdFromRequest(request);
    const t = await getValidationTranslatorFromRequest(request);
    
    if (!tenantId) {
      return NextResponse.json({ success: false, error: t('validation.tenantNotFound', 'Tenant not found') }, { status: 404 });
    }
    
    const body = await request.json();
    const { name, rate, label, appliesTo, categoryIds, productIds, region, priority, isActive } = body;
    
    // Validate required fields
    if (!name || !name.trim()) {
      return NextResponse.json(
        { success: false, error: t('validation.taxRuleNameRequired', 'Tax rule name is required') },
        { status: 400 }
      );
    }
    
    if (rate === undefined || rate === null || isNaN(rate) || rate < 0 || rate > 100) {
      return NextResponse.json(
        { success: false, error: t('validation.taxRateRequired', 'Tax rate must be between 0 and 100') },
        { status: 400 }
      );
    }
    
    const taxRule = await TaxRule.create({
      tenantId,
      name: name.trim(),
      rate: parseFloat(rate),
      label: label?.trim() || 'Tax',
      appliesTo: appliesTo || 'all',
      categoryIds: categoryIds || [],
      productIds: productIds || [],
      region: region || {},
      priority: priority || 0,
      isActive: isActive !== undefined ? isActive : true,
    });
    
    await createAuditLog(request, {
      tenantId,
      action: AuditActions.CREATE,
      entityType: 'taxRule',
      entityId: taxRule._id.toString(),
      changes: { name, rate, label },
    });
    
    return NextResponse.json({ success: true, data: taxRule }, { status: 201 });
  } catch (error: unknown) {
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}
