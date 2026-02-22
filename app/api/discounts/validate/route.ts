import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Discount from '@/models/Discount';
import { getTenantIdFromRequest } from '@/lib/api-tenant';
import { requireAuth } from '@/lib/auth';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { getTenantSettingsById } from '@/lib/tenant';

export async function POST(request: NextRequest) {
  try {
    await connectDB();
    await requireAuth(request);
    const tenantId = await getTenantIdFromRequest(request);
    const t = await getValidationTranslatorFromRequest(request);
    
    if (!tenantId) {
      return NextResponse.json({ success: false, error: t('validation.tenantNotFound', 'Tenant not found') }, { status: 404 });
    }
    
    // Get tenant settings to check feature flags
    const tenantSettings = await getTenantSettingsById(tenantId);
    
    // Check if discounts are enabled
    if (tenantSettings && tenantSettings.enableDiscounts === false) {
      return NextResponse.json(
        { success: false, error: t('validation.discountsNotEnabled', 'Discounts are not enabled for this tenant') },
        { status: 400 }
      );
    }
    
    const body = await request.json();
    const { code, subtotal } = body;

    if (!code) {
      return NextResponse.json(
        { success: false, error: t('validation.discountCodeRequired', 'Discount code is required') },
        { status: 400 }
      );
    }

    const discount = await Discount.findOne({
      tenantId,
      code: code.toUpperCase(),
      isActive: true,
    });

    if (!discount) {
      return NextResponse.json(
        { success: false, error: t('validation.invalidDiscountCode', 'Invalid or inactive discount code') },
        { status: 404 }
      );
    }

    // Check validity dates
    const now = new Date();
    if (now < discount.validFrom || now > discount.validUntil) {
      return NextResponse.json(
        { success: false, error: t('validation.discountCodeNotValid', 'Discount code is not valid at this time') },
        { status: 400 }
      );
    }

    // Check usage limit
    if (discount.usageLimit && discount.usageCount >= discount.usageLimit) {
      return NextResponse.json(
        { success: false, error: t('validation.discountCodeUsageLimit', 'Discount code has reached its usage limit') },
        { status: 400 }
      );
    }

    // Check minimum purchase amount
    if (discount.minPurchaseAmount && subtotal < discount.minPurchaseAmount) {
      const errorMsg = t('validation.minimumPurchaseAmount', 'Minimum purchase amount of {amount} required').replace('{amount}', discount.minPurchaseAmount.toString());
      return NextResponse.json(
        { 
          success: false, 
          error: errorMsg
        },
        { status: 400 }
      );
    }

    // Calculate discount amount
    let discountAmount = 0;
    if (discount.type === 'percentage') {
      discountAmount = (subtotal * discount.value) / 100;
      if (discount.maxDiscountAmount) {
        discountAmount = Math.min(discountAmount, discount.maxDiscountAmount);
      }
    } else {
      discountAmount = Math.min(discount.value, subtotal);
    }

    return NextResponse.json({
      success: true,
      data: {
        code: discount.code,
        name: discount.name,
        type: discount.type,
        value: discount.value,
        discountAmount,
        finalTotal: Math.max(0, subtotal - discountAmount),
      },
    });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

