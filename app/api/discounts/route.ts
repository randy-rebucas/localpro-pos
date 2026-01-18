import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Discount from '@/models/Discount';
import { requireTenantAccess } from '@/lib/api-tenant';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { requireAuth as _requireAuth, requireRole } from '@/lib/auth';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';

export async function GET(request: NextRequest) {
  try {
    await connectDB();
    // SECURITY: Validate tenant access for authenticated requests
    let tenantId: string;
    try {
      const tenantAccess = await requireTenantAccess(request);
      tenantId = tenantAccess.tenantId;
    } catch (authError: unknown) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const _t = await getValidationTranslatorFromRequest(request);
      if (authError instanceof Error && (authError.message.includes('Unauthorized') || authError.message.includes('Forbidden'))) {
        return NextResponse.json(
          { success: false, error: authError.message },
          { status: authError.message.includes('Unauthorized') ? 401 : 403 }
        );
      }
      throw authError;
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const _t = await getValidationTranslatorFromRequest(request);
    
    const searchParams = request.nextUrl.searchParams;
    const code = searchParams.get('code');
    const activeOnly = searchParams.get('activeOnly') === 'true';

    const query: Record<string, unknown> = { tenantId };
    
    if (code) {
      query.code = code.toUpperCase();
    }
    
    if (activeOnly) {
      query.isActive = true;
      query.validFrom = { $lte: new Date() };
      query.validUntil = { $gte: new Date() };
    }

    const discounts = await Discount.find(query).sort({ createdAt: -1 });

    return NextResponse.json({ success: true, data: discounts });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to fetch discounts';
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await connectDB();
    // SECURITY: Validate tenant access for authenticated requests
    let tenantId: string;
    try {
      const tenantAccess = await requireTenantAccess(request);
      tenantId = tenantAccess.tenantId;
      // Also check role
      await requireRole(request, ['admin', 'manager']);
    } catch (authError: unknown) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const _t = await getValidationTranslatorFromRequest(request);
      if (authError instanceof Error && (authError.message.includes('Unauthorized') || authError.message.includes('Forbidden'))) {
        return NextResponse.json(
          { success: false, error: authError.message },
          { status: authError.message.includes('Unauthorized') ? 401 : 403 }
        );
      }
      throw authError;
    }
    const t = await getValidationTranslatorFromRequest(request);
    
    const body = await request.json();
    const {
      code,
      name,
      description,
      type,
      value,
      minPurchaseAmount,
      maxDiscountAmount,
      validFrom,
      validUntil,
      usageLimit,
      isActive = true,
    } = body;

    // Validate required fields
    if (!code || !type || value === undefined || !validFrom || !validUntil) {
      return NextResponse.json(
        { success: false, error: t('validation.missingRequiredFields', 'Missing required fields') },
        { status: 400 }
      );
    }

    // Validate value based on type
    if (type === 'percentage' && (value < 0 || value > 100)) {
      return NextResponse.json(
        { success: false, error: t('validation.percentageDiscountRange', 'Percentage discount must be between 0 and 100') },
        { status: 400 }
      );
    }

    if (type === 'fixed' && value < 0) {
      return NextResponse.json(
        { success: false, error: t('validation.fixedDiscountPositive', 'Fixed discount must be positive') },
        { status: 400 }
      );
    }

    // Check if code already exists for this tenant
    const existing = await Discount.findOne({ tenantId, code: code.toUpperCase() });
    if (existing) {
      return NextResponse.json(
        { success: false, error: t('validation.discountCodeExists', 'Discount code already exists') },
        { status: 400 }
      );
    }

    const discount = await Discount.create({
      tenantId,
      code: code.toUpperCase(),
      name,
      description,
      type,
      value,
      minPurchaseAmount,
      maxDiscountAmount,
      validFrom: new Date(validFrom),
      validUntil: new Date(validUntil),
      usageLimit,
      isActive,
      usageCount: 0,
    });

    await createAuditLog(request, {
      tenantId,
      action: AuditActions.DISCOUNT_CREATE,
      entityType: 'discount',
      entityId: discount._id.toString(),
      changes: { code, type, value },
    });

    return NextResponse.json({ success: true, data: discount }, { status: 201 });
  } catch (error: unknown) {
    const t = await getValidationTranslatorFromRequest(request);
    if (error && typeof error === 'object' && 'code' in error && error.code === 11000) {
      return NextResponse.json(
        { success: false, error: t('validation.discountCodeExists', 'Discount code already exists') },
        { status: 400 }
      );
    }
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Failed to create discount' }, { status: 400 });
  }
}

