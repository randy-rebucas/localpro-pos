import { NextRequest, NextResponse } from 'next/server';
import { getRepos, type Patch, type TaxRuleInput } from '@/lib/db';
import { getTenantIdFromRequest, requireTenantAccess } from '@/lib/api-tenant';
import { requireAuth } from '@/lib/auth';
import { hasTenantPermission } from '@/lib/permissions-server';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { checkRateLimit } from '@/lib/rate-limit';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Require authentication to prevent unauthenticated tax-rule lookups
    const authResult = await requireTenantAccess(request);
    if (authResult instanceof NextResponse) return authResult;
    const tenantId = authResult.tenantId;

    if (!tenantId) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    const taxRule = await getRepos().taxRules.findById(tenantId, id);

    if (!taxRule) {
      return NextResponse.json({ success: false, error: 'Tax rule not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: taxRule });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
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

    const { taxRules } = getRepos();
    const taxRule = await taxRules.findById(tenantId, id);

    if (!taxRule) {
      return NextResponse.json({ success: false, error: t('validation.taxRuleNotFound', 'Tax rule not found') }, { status: 404 });
    }

    const body = await request.json();
    const oldData = { name: taxRule.name, rate: taxRule.rate, isActive: taxRule.isActive };
    const patch: Patch<TaxRuleInput> = {};

    if (body.name !== undefined) patch.name = body.name.trim();
    if (body.rate !== undefined) {
      if (isNaN(body.rate) || body.rate < 0 || body.rate > 100) {
        return NextResponse.json(
          { success: false, error: t('validation.taxRateRequired', 'Tax rate must be between 0 and 100') },
          { status: 400 }
        );
      }
      patch.rate = parseFloat(body.rate);
    }
    if (body.label !== undefined) patch.label = body.label.trim();
    if (body.appliesTo !== undefined) patch.appliesTo = body.appliesTo;
    if (body.categoryIds !== undefined) patch.categoryIds = body.categoryIds;
    if (body.productIds !== undefined) patch.productIds = body.productIds;
    if (body.region !== undefined) patch.region = body.region;
    if (body.priority !== undefined) patch.priority = body.priority;
    if (body.isActive !== undefined) patch.isActive = body.isActive;

    const result = await taxRules.update(tenantId, id, patch);
    if (!result) {
      return NextResponse.json({ success: false, error: t('validation.taxRuleNotFound', 'Tax rule not found') }, { status: 404 });
    }
    const updated = result.after;

    await createAuditLog(request, {
      tenantId,
      userId: user.userId,
      action: AuditActions.UPDATE,
      entityType: 'taxRule',
      entityId: id,
      changes: { old: oldData, new: { name: updated.name, rate: updated.rate, isActive: updated.isActive } },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
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

    const taxRule = await getRepos().taxRules.delete(tenantId, id);

    if (!taxRule) {
      return NextResponse.json({ success: false, error: t('validation.taxRuleNotFound', 'Tax rule not found') }, { status: 404 });
    }

    await createAuditLog(request, {
      tenantId,
      userId: user.userId,
      action: AuditActions.DELETE,
      entityType: 'taxRule',
      entityId: id,
      changes: { name: taxRule.name },
    });

    return NextResponse.json({ success: true, message: 'Tax rule deleted' });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}
