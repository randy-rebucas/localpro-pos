import { NextRequest, NextResponse } from 'next/server';
import { handleApiError } from '@/lib/error-handler';
import connectDB from '@/lib/mongodb';
import TaxRule from '@/models/TaxRule';
import { getTenantIdFromRequest, requireTenantAccess } from '@/lib/api-tenant';
import { requireAuth } from '@/lib/auth';
import { hasTenantPermission } from '@/lib/permissions-server';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { checkRateLimit } from '@/lib/rate-limit';
import { parseTaxRuleInput } from '@/lib/tax-rule-input';
import { taxRuleIdsBelongToTenant } from '@/lib/tax-rule-ownership';

export async function GET(request: NextRequest) {
  try {
    await connectDB();

    // Require authentication to prevent unauthenticated tax-rule enumeration
    const authResult = await requireTenantAccess(request);
    if (authResult instanceof NextResponse) return authResult;
    const tenantId = authResult.tenantId;

    if (!tenantId) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    const ip = request.headers.get('x-forwarded-for') ?? 'unknown';
    const { allowed } = checkRateLimit(`read:tax-rules:${tenantId}:${ip}`, 60, 60_000);
    if (!allowed) {
      return NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429 });
    }

    const searchParams = request.nextUrl.searchParams;
    const isActive = searchParams.get('isActive');
    
    const query: any = { tenantId }; // eslint-disable-line @typescript-eslint/no-explicit-any
    if (isActive !== null) {
      query.isActive = isActive === 'true';
    }
    
    const taxRules = await TaxRule.find(query)
      .sort({ priority: -1, createdAt: -1 })
      .lean();
    
    return NextResponse.json({ success: true, data: taxRules });
  } catch (error: unknown) {
    return handleApiError(error, 'Failed to fetch tax rules');
  }
}

export async function POST(request: NextRequest) {
  try {
    await connectDB();
    const user = await requireAuth(request);
    const tenantId = await getTenantIdFromRequest(request);
    const t = await getValidationTranslatorFromRequest(request);

    if (!tenantId) {
      return NextResponse.json({ success: false, error: t('validation.tenantNotFound', 'Tenant not found') }, { status: 404 });
    }

    if (!(await hasTenantPermission(user.role, tenantId, 'tax_rules.manage'))) {
      return NextResponse.json({ success: false, error: 'Forbidden: Insufficient permissions' }, { status: 403 });
    }

    const ip = request.headers.get('x-forwarded-for') ?? 'unknown';
    const { allowed } = checkRateLimit(`write:tax-rules:${tenantId}:${ip}`, 30, 60_000);
    if (!allowed) {
      return NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429 });
    }

    const parsed = parseTaxRuleInput(await request.json().catch(() => null), false);
    if (!parsed.ok) {
      return NextResponse.json({ success: false, error: t(parsed.error.key, parsed.error.fallback) }, { status: 400 });
    }
    const input = parsed.data;

    const ownsIds = await taxRuleIdsBelongToTenant(tenantId, input.categoryIds, input.productIds);
    if (!ownsIds) {
      return NextResponse.json({ success: false, error: t('validation.taxRuleIdsInvalid', 'The tax rule lists an item that does not exist') }, { status: 400 });
    }

    const taxRule = await TaxRule.create({ tenantId, ...input });

    await createAuditLog(request, {
      tenantId,
      userId: user.userId,
      action: AuditActions.CREATE,
      entityType: 'taxRule',
      entityId: taxRule._id.toString(),
      changes: { name: input.name, rate: input.rate, label: input.label, appliesTo: input.appliesTo, priority: input.priority },
    });
    
    return NextResponse.json({ success: true, data: taxRule }, { status: 201 });
  } catch (error: unknown) {
    return handleApiError(error, 'Failed to create tax rule');
  }
}
