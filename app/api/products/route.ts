import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Product from '@/models/Product';
import { getTenantIdFromRequest, requireTenantAccess } from '@/lib/api-tenant';
import { requireAuth } from '@/lib/auth';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { validateAndSanitize, validateProduct } from '@/lib/validation';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { getTenantSettingsById } from '@/lib/tenant';
import { validateProductForBusiness, getDefaultProductSettings } from '@/lib/business-type-helpers';

export async function GET(request: NextRequest) {
  try {
    await connectDB();
    const tenantId = await getTenantIdFromRequest(request);
    
    if (!tenantId) {
      return NextResponse.json({ success: false, error: 'Tenant not found or access denied' }, { status: 403 });
    }
    
    const searchParams = request.nextUrl.searchParams;
    const search = searchParams.get('search') || '';
    const category = searchParams.get('category') || '';
    const categoryId = searchParams.get('categoryId') || '';

    const query: any = { tenantId };
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { sku: { $regex: search, $options: 'i' } },
      ];
    }
    if (category) {
      query.category = category;
    }
    if (categoryId) {
      query.categoryId = categoryId;
    }

    const products = await Product.find(query)
      .populate('categoryId', 'name')
      .sort({ pinned: -1, createdAt: -1 }) // Pinned products first, then by creation date
      .lean();
    
    return NextResponse.json({ success: true, data: products });
  } catch (error: any) {
    console.error('Error fetching products:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
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
    } catch (authError: any) {
      if (authError.message.includes('Unauthorized') || authError.message.includes('Forbidden')) {
        return NextResponse.json(
          { success: false, error: authError.message },
          { status: authError.message.includes('Unauthorized') ? 401 : 403 }
        );
      }
      throw authError;
    }
    
    const body = await request.json();
    const t = await getValidationTranslatorFromRequest(request);
    const { data, errors } = validateAndSanitize(body, validateProduct, t);

    if (errors.length > 0) {
      return NextResponse.json(
        { success: false, errors },
        { status: 400 }
      );
    }

    // Get tenant settings for business type validation
    const tenantSettings = await getTenantSettingsById(tenantId);
    if (tenantSettings) {
      // Validate product against business type
      const businessValidation = validateProductForBusiness(data, tenantSettings);
      if (!businessValidation.valid) {
        return NextResponse.json(
          {
            success: false,
            errors: businessValidation.errors.map(error => ({
              field: 'businessType',
              message: error,
              code: 'businessTypeValidation',
            })),
          },
          { status: 400 }
        );
      }

      // Apply default product settings based on business type
      const defaultSettings = getDefaultProductSettings(tenantSettings);
      Object.assign(data, defaultSettings, data); // Defaults first, then user data
    }

    const product = await Product.create({ ...data, tenantId });

    await createAuditLog(request, {
      tenantId,
      action: AuditActions.CREATE,
      entityType: 'product',
      entityId: product._id.toString(),
      changes: data,
    });

    return NextResponse.json({ success: true, data: product }, { status: 201 });
  } catch (error: any) {
    if (error.code === 11000) {
      return NextResponse.json(
        { success: false, error: 'Product with this SKU already exists' },
        { status: 400 }
      );
    }
    console.error('Error creating product:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}

