import { NextRequest, NextResponse } from 'next/server';
import { getTenantIdFromRequest, requireTenantAccess } from '@/lib/api-tenant';
import { requireAuth } from '@/lib/auth';
import { hasTenantPermission } from '@/lib/permissions-server';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { findTaxRules, createTaxRule } from '@/lib/data/tax-rules';

export async function GET(request: NextRequest) {
  try {
    // Require authentication to prevent unauthenticated tax-rule enumeration
    const authResult = await requireTenantAccess(request);
    if (authResult instanceof NextResponse) return authResult;
    const tenantId = authResult.tenantId;

    if (!tenantId) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    const searchParams = request.nextUrl.searchParams;
    const isActiveParam = searchParams.get('isActive');

    const taxRules = await findTaxRules(tenantId, isActiveParam !== null ? isActiveParam === 'true' : undefined);

    return NextResponse.json({
      success: true,
      data: taxRules.map(({ id, ...rest }) => ({ _id: id, ...rest, rate: Number(rest.rate) })),
    });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth(request);
    const tenantId = await getTenantIdFromRequest(request);
    const t = await getValidationTranslatorFromRequest(request);

    if (!tenantId) {
      return NextResponse.json({ success: false, error: t('validation.tenantNotFound', 'Tenant not found') }, { status: 404 });
    }

    if (!(await hasTenantPermission(user.role, tenantId, 'tax_rules.manage'))) {
      return NextResponse.json({ success: false, error: 'Forbidden: Insufficient permissions' }, { status: 403 });
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

    const taxRule = await createTaxRule(tenantId, {
      name: name.trim(),
      rate: parseFloat(rate),
      label: label?.trim(),
      appliesTo,
      categoryIds,
      productIds,
      region,
      priority,
      isActive,
    });

    await createAuditLog(request, {
      tenantId,
      userId: user.userId,
      action: AuditActions.CREATE,
      entityType: 'taxRule',
      entityId: taxRule.id,
      changes: { name, rate, label },
    });

    const { id, ...rest } = taxRule;
    return NextResponse.json({ success: true, data: { _id: id, ...rest, rate: Number(rest.rate) } }, { status: 201 });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}
