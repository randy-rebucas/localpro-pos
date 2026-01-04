import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Discount from '@/models/Discount';
import { getTenantIdFromRequest } from '@/lib/api-tenant';
import { requireRole } from '@/lib/auth';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await connectDB();
    await requireRole(request, ['admin', 'manager']);
    const tenantId = await getTenantIdFromRequest(request);
    const { id } = await params;
    const t = await getValidationTranslatorFromRequest(request);
    
    if (!tenantId) {
      return NextResponse.json({ success: false, error: t('validation.tenantNotFound', 'Tenant not found') }, { status: 404 });
    }

    const discount = await Discount.findOne({ _id: id, tenantId });
    if (!discount) {
      return NextResponse.json({ success: false, error: t('validation.discountNotFound', 'Discount not found') }, { status: 404 });
    }

    const body = await request.json();
    const updates: Partial<{ name: string; code: string; description: string; type: string; value: number; minPurchaseAmount: number; maxDiscountAmount: number; usageLimit: number; validFrom: Date; validUntil: Date; isActive: boolean }> = {};

    if (body.name !== undefined) updates.name = body.name;
    if (body.description !== undefined) updates.description = body.description;
    if (body.value !== undefined) {
      if (discount.type === 'percentage' && (body.value < 0 || body.value > 100)) {
        return NextResponse.json(
          { success: false, error: t('validation.percentageDiscountRange', 'Percentage discount must be between 0 and 100') },
          { status: 400 }
        );
      }
      if (discount.type === 'fixed' && body.value < 0) {
        return NextResponse.json(
          { success: false, error: t('validation.fixedDiscountPositive', 'Fixed discount must be positive') },
          { status: 400 }
        );
      }
      updates.value = body.value;
    }
    if (body.minPurchaseAmount !== undefined) updates.minPurchaseAmount = body.minPurchaseAmount;
    if (body.maxDiscountAmount !== undefined) updates.maxDiscountAmount = body.maxDiscountAmount;
    if (body.validFrom !== undefined) updates.validFrom = new Date(body.validFrom);
    if (body.validUntil !== undefined) updates.validUntil = new Date(body.validUntil);
    if (body.usageLimit !== undefined) updates.usageLimit = body.usageLimit;
    if (body.isActive !== undefined) updates.isActive = body.isActive;

    Object.assign(discount, updates);
    await discount.save();

    await createAuditLog(request, {
      tenantId,
      action: AuditActions.DISCOUNT_UPDATE,
      entityType: 'discount',
      entityId: id,
      changes: updates,
    });

    return NextResponse.json({ success: true, data: discount });
  } catch (error: unknown) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Failed to update discount' }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await connectDB();
    await requireRole(request, ['admin', 'manager']);
    const tenantId = await getTenantIdFromRequest(request);
    const { id } = await params;
    const t = await getValidationTranslatorFromRequest(request);
    
    if (!tenantId) {
      return NextResponse.json({ success: false, error: t('validation.tenantNotFound', 'Tenant not found') }, { status: 404 });
    }

    const discount = await Discount.findOne({ _id: id, tenantId });
    if (!discount) {
      return NextResponse.json({ success: false, error: t('validation.discountNotFound', 'Discount not found') }, { status: 404 });
    }

    await discount.deleteOne();

    await createAuditLog(request, {
      tenantId,
      action: AuditActions.DISCOUNT_DELETE,
      entityType: 'discount',
      entityId: id,
      changes: { code: discount.code },
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Failed to update discount' }, { status: 400 });
  }
}

