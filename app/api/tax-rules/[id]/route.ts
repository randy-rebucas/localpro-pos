import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import TaxRule from '@/models/TaxRule';
import { getTenantIdFromRequest } from '@/lib/api-tenant';
import { requireAuth } from '@/lib/auth';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await connectDB();
    const { id } = await params;
    const tenantId = await getTenantIdFromRequest(request);
    
    if (!tenantId) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }
    
    const taxRule = await TaxRule.findOne({ _id: id, tenantId }).lean();
    
    if (!taxRule) {
      return NextResponse.json({ success: false, error: 'Tax rule not found' }, { status: 404 });
    }
    
    return NextResponse.json({ success: true, data: taxRule });
  } catch (error: unknown) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await connectDB();
    const { id } = await params;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const _user = await requireAuth(request);
    const tenantId = await getTenantIdFromRequest(request);
    const t = await getValidationTranslatorFromRequest(request);
    
    if (!tenantId) {
      return NextResponse.json({ success: false, error: t('validation.tenantNotFound', 'Tenant not found') }, { status: 404 });
    }
    
    const taxRule = await TaxRule.findOne({ _id: id, tenantId });
    
    if (!taxRule) {
      return NextResponse.json({ success: false, error: t('validation.taxRuleNotFound', 'Tax rule not found') }, { status: 404 });
    }
    
    const body = await request.json();
    const oldData = { name: taxRule.name, rate: taxRule.rate, isActive: taxRule.isActive };
    
    if (body.name !== undefined) taxRule.name = body.name.trim();
    if (body.rate !== undefined) {
      if (isNaN(body.rate) || body.rate < 0 || body.rate > 100) {
        return NextResponse.json(
          { success: false, error: t('validation.taxRateRequired', 'Tax rate must be between 0 and 100') },
          { status: 400 }
        );
      }
      taxRule.rate = parseFloat(body.rate);
    }
    if (body.label !== undefined) taxRule.label = body.label.trim();
    if (body.appliesTo !== undefined) taxRule.appliesTo = body.appliesTo;
    if (body.categoryIds !== undefined) taxRule.categoryIds = body.categoryIds;
    if (body.productIds !== undefined) taxRule.productIds = body.productIds;
    if (body.region !== undefined) taxRule.region = body.region;
    if (body.priority !== undefined) taxRule.priority = body.priority;
    if (body.isActive !== undefined) taxRule.isActive = body.isActive;
    
    await taxRule.save();
    
    await createAuditLog(request, {
      tenantId,
      action: AuditActions.UPDATE,
      entityType: 'taxRule',
      entityId: taxRule._id.toString(),
      changes: { old: oldData, new: { name: taxRule.name, rate: taxRule.rate, isActive: taxRule.isActive } },
    });
    
    return NextResponse.json({ success: true, data: taxRule });
  } catch (error: unknown) {
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await connectDB();
    const { id } = await params;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const _user = await requireAuth(request);
    const tenantId = await getTenantIdFromRequest(request);
    const t = await getValidationTranslatorFromRequest(request);
    
    if (!tenantId) {
      return NextResponse.json({ success: false, error: t('validation.tenantNotFound', 'Tenant not found') }, { status: 404 });
    }
    
    const taxRule = await TaxRule.findOneAndDelete({ _id: id, tenantId });
    
    if (!taxRule) {
      return NextResponse.json({ success: false, error: t('validation.taxRuleNotFound', 'Tax rule not found') }, { status: 404 });
    }
    
    await createAuditLog(request, {
      tenantId,
      action: AuditActions.DELETE,
      entityType: 'taxRule',
      entityId: id,
      changes: { name: taxRule.name },
    });
    
    return NextResponse.json({ success: true, message: 'Tax rule deleted' });
  } catch (error: unknown) {
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}
