import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await connectDB();
    const { id } = await params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ success: false, error: 'Tax rule not found' }, { status: 404 });
    }

    // Require authentication to prevent unauthenticated tax-rule lookups
    const authResult = await requireTenantAccess(request);
    if (authResult instanceof NextResponse) return authResult;
    const tenantId = authResult.tenantId;

    if (!tenantId) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    const taxRule = await TaxRule.findOne({ _id: id, tenantId }).lean();
    
    if (!taxRule) {
      return NextResponse.json({ success: false, error: 'Tax rule not found' }, { status: 404 });
    }
    
    return NextResponse.json({ success: true, data: taxRule });
  } catch (error: unknown) {
    return handleApiError(error, 'Failed to fetch tax rule');
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await connectDB();
    const { id } = await params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ success: false, error: 'Tax rule not found' }, { status: 404 });
    }
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

    const taxRule = await TaxRule.findOne({ _id: id, tenantId });

    if (!taxRule) {
      return NextResponse.json({ success: false, error: t('validation.taxRuleNotFound', 'Tax rule not found') }, { status: 404 });
    }

    const parsed = parseTaxRuleInput(await request.json().catch(() => null), true);
    if (!parsed.ok) {
      return NextResponse.json({ success: false, error: t(parsed.error.key, parsed.error.fallback) }, { status: 400 });
    }
    const input = parsed.data;

    // Judge the rule as it will be saved, not just the fields sent: switching to "categories"
    // without sending categories would leave a rule that never matches a sale.
    const scope = input.appliesTo ?? taxRule.appliesTo;
    const categoryCount = input.categoryIds?.length ?? taxRule.categoryIds?.length ?? 0;
    if (scope === 'categories' && categoryCount === 0) {
      return NextResponse.json({ success: false, error: t('validation.taxRuleCategoriesRequired', 'Pick at least one category for this tax rule') }, { status: 400 });
    }

    if (!(await taxRuleIdsBelongToTenant(tenantId, input.categoryIds, input.productIds))) {
      return NextResponse.json({ success: false, error: t('validation.taxRuleIdsInvalid', 'The tax rule lists an item that does not exist') }, { status: 400 });
    }

    const oldData = { name: taxRule.name, rate: taxRule.rate, isActive: taxRule.isActive };
    taxRule.set(input);
    await taxRule.save();
    
    await createAuditLog(request, {
      tenantId,
      userId: user.userId,
      action: AuditActions.UPDATE,
      entityType: 'taxRule',
      entityId: taxRule._id.toString(),
      changes: { old: oldData, new: { name: taxRule.name, rate: taxRule.rate, isActive: taxRule.isActive } },
    });
    
    return NextResponse.json({ success: true, data: taxRule });
  } catch (error: unknown) {
    return handleApiError(error, 'Failed to update tax rule');
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await connectDB();
    const { id } = await params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ success: false, error: 'Tax rule not found' }, { status: 404 });
    }
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

    const taxRule = await TaxRule.findOneAndDelete({ _id: id, tenantId });
    
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
  } catch (error: unknown) {
    return handleApiError(error, 'Failed to delete tax rule');
  }
}
