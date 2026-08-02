import { NextRequest, NextResponse } from 'next/server';
import { getTenantIdFromRequest, requireTenantAccess } from '@/lib/api-tenant'; // eslint-disable-line @typescript-eslint/no-unused-vars
import { requireAuth } from '@/lib/auth'; // eslint-disable-line @typescript-eslint/no-unused-vars
import { hasTenantPermission } from '@/lib/permissions-server';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { checkFeatureAccess } from '@/lib/subscription';
import { ensureLegalDiscounts, findDiscounts, findDiscountByCode, createDiscount } from '@/lib/data/discounts';

export async function GET(request: NextRequest) {
  try {
    // SECURITY: Validate tenant access for authenticated requests
    let tenantId: string;
    try {
      const tenantAccess = await requireTenantAccess(request);
      tenantId = tenantAccess.tenantId;
    } catch (authError: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
      const t = await getValidationTranslatorFromRequest(request); // eslint-disable-line @typescript-eslint/no-unused-vars
      if (authError.message.includes('Unauthorized') || authError.message.includes('Forbidden')) {
        return NextResponse.json(
          { success: false, error: authError.message },
          { status: authError.message.includes('Unauthorized') ? 401 : 403 }
        );
      }
      throw authError;
    }
    const t = await getValidationTranslatorFromRequest(request); // eslint-disable-line @typescript-eslint/no-unused-vars

    // Auto-seed legal discounts (SC20, PWD20) for this tenant
    await ensureLegalDiscounts(tenantId);

    const searchParams = request.nextUrl.searchParams;
    const code = searchParams.get('code');
    const activeOnly = searchParams.get('activeOnly') === 'true';

    const discounts = await findDiscounts(tenantId, {
      code: code ? code.toUpperCase() : undefined,
      activeOnly,
    });

    return NextResponse.json({
      success: true,
      data: discounts.map(({ id, ...rest }) => ({ _id: id, ...rest, value: Number(rest.value), minPurchaseAmount: rest.minPurchaseAmount != null ? Number(rest.minPurchaseAmount) : rest.minPurchaseAmount, maxDiscountAmount: rest.maxDiscountAmount != null ? Number(rest.maxDiscountAmount) : rest.maxDiscountAmount })),
    });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    // SECURITY: Validate tenant access for authenticated requests
    let tenantId: string;
    try {
      const tenantAccess = await requireTenantAccess(request);
      tenantId = tenantAccess.tenantId;
      // Also check role
      if (!(await hasTenantPermission(tenantAccess.user.role, tenantId, 'discounts.manage'))) {
        throw new Error('Forbidden: Insufficient permissions');
      }
    } catch (authError: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
      const t = await getValidationTranslatorFromRequest(request); // eslint-disable-line @typescript-eslint/no-unused-vars
      if (authError.message.includes('Unauthorized') || authError.message.includes('Forbidden')) {
        return NextResponse.json(
          { success: false, error: authError.message },
          { status: authError.message.includes('Unauthorized') ? 401 : 403 }
        );
      }
      throw authError;
    }

    // Check if discounts feature is enabled in subscription
    try {
      await checkFeatureAccess(tenantId.toString(), 'enableDiscounts');
    } catch (featureError: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
      return NextResponse.json(
        { success: false, error: featureError.message },
        { status: 403 }
      );
    }

    const t = await getValidationTranslatorFromRequest(request);

    const body = await request.json();
    const {
      code,
      name,
      description,
      type,
      value,
      category,
      requiresIdVerification,
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

    // Input length validation
    if (typeof code === 'string' && code.length > 50) {
      return NextResponse.json({ success: false, error: 'Code must be 50 characters or less' }, { status: 400 });
    }
    if (name && typeof name === 'string' && name.length > 100) {
      return NextResponse.json({ success: false, error: 'Name must be 100 characters or less' }, { status: 400 });
    }
    if (description && typeof description === 'string' && description.length > 500) {
      return NextResponse.json({ success: false, error: 'Description must be 500 characters or less' }, { status: 400 });
    }

    // Validate date range
    if (new Date(validFrom) >= new Date(validUntil)) {
      return NextResponse.json(
        { success: false, error: t('validation.validUntilAfterFrom', 'End date must be after start date') },
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
    const existing = await findDiscountByCode(tenantId, code.toUpperCase());
    if (existing) {
      return NextResponse.json(
        { success: false, error: t('validation.discountCodeExists', 'Discount code already exists') },
        { status: 400 }
      );
    }

    const discount = await createDiscount(tenantId, {
      code: code.toUpperCase(),
      name,
      description,
      type,
      value,
      category: category || 'general',
      requiresIdVerification: requiresIdVerification || false,
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
      entityId: discount.id,
      changes: { code, type, value },
    });

    const { id, ...rest } = discount;
    return NextResponse.json({ success: true, data: { _id: id, ...rest, value: Number(rest.value) } }, { status: 201 });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    const t = await getValidationTranslatorFromRequest(request);
    if (error.code === 'P2002') {
      return NextResponse.json(
        { success: false, error: t('validation.discountCodeExists', 'Discount code already exists') },
        { status: 400 }
      );
    }
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}
