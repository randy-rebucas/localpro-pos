import { NextRequest, NextResponse } from 'next/server';
import { getTenantIdFromRequest, requireTenantAccess } from '@/lib/api-tenant';
import { requireAuth } from '@/lib/auth';
import { hasTenantPermission } from '@/lib/permissions-server';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { getTaxRuleById, updateTaxRule, deleteTaxRule } from '@/lib/data/tax-rules';
import type { Prisma } from '@prisma/client';

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

    const taxRule = await getTaxRuleById(tenantId, id);

    if (!taxRule) {
      return NextResponse.json({ success: false, error: 'Tax rule not found' }, { status: 404 });
    }

    const { id: ruleId, ...rest } = taxRule;
    return NextResponse.json({ success: true, data: { _id: ruleId, ...rest, rate: Number(rest.rate) } });
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

    const taxRule = await getTaxRuleById(tenantId, id);

    if (!taxRule) {
      return NextResponse.json({ success: false, error: t('validation.taxRuleNotFound', 'Tax rule not found') }, { status: 404 });
    }

    const body = await request.json();
    const oldData = { name: taxRule.name, rate: Number(taxRule.rate), isActive: taxRule.isActive };

    const updates: Prisma.TaxRuleUpdateInput = {};
    if (body.name !== undefined) updates.name = body.name.trim();
    if (body.rate !== undefined) {
      if (isNaN(body.rate) || body.rate < 0 || body.rate > 100) {
        return NextResponse.json(
          { success: false, error: t('validation.taxRateRequired', 'Tax rate must be between 0 and 100') },
          { status: 400 }
        );
      }
      updates.rate = parseFloat(body.rate);
    }
    if (body.label !== undefined) updates.label = body.label.trim();
    if (body.appliesTo !== undefined) updates.appliesTo = body.appliesTo;
    if (body.categoryIds !== undefined) updates.categoryIds = body.categoryIds;
    if (body.productIds !== undefined) updates.productIds = body.productIds;
    if (body.region !== undefined) updates.region = body.region;
    if (body.priority !== undefined) updates.priority = body.priority;
    if (body.isActive !== undefined) updates.isActive = body.isActive;

    const updated = await updateTaxRule(id, updates);

    await createAuditLog(request, {
      tenantId,
      userId: user.userId,
      action: AuditActions.UPDATE,
      entityType: 'taxRule',
      entityId: id,
      changes: { old: oldData, new: { name: updated.name, rate: Number(updated.rate), isActive: updated.isActive } },
    });

    const { id: ruleId, ...rest } = updated;
    return NextResponse.json({ success: true, data: { _id: ruleId, ...rest, rate: Number(rest.rate) } });
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

    const taxRule = await getTaxRuleById(tenantId, id);
    if (!taxRule) {
      return NextResponse.json({ success: false, error: t('validation.taxRuleNotFound', 'Tax rule not found') }, { status: 404 });
    }

    await deleteTaxRule(id);

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
