import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Product from '@/models/Product';
import { getTenantIdFromRequest, requireTenantAccess } from '@/lib/api-tenant';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { requireAuth as _requireAuth } from '@/lib/auth';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { validateAndSanitize, validateProduct } from '@/lib/validation';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { handleApiError } from '@/lib/error-handler';
import { getTenantSettingsById } from '@/lib/tenant';
import { validateProductForBusiness } from '@/lib/business-type-helpers';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await connectDB();
    const tenantId = await getTenantIdFromRequest(request);
    const { id } = await params;
    
    if (!tenantId) {
      return NextResponse.json({ success: false, error: 'Tenant not found or access denied' }, { status: 403 });
    }
    
    const product = await Product.findOne({ _id: id, tenantId }).lean();
    
    if (!product) {
      return NextResponse.json({ success: false, error: 'Product not found' }, { status: 404 });
    }
    
    // Ensure boolean fields are properly set
    const productData = {
      ...product,
      trackInventory: product.trackInventory !== undefined ? Boolean(product.trackInventory) : true,
      allowOutOfStockSales: product.allowOutOfStockSales !== undefined ? Boolean(product.allowOutOfStockSales) : false,
    };
    
    return NextResponse.json({ success: true, data: productData });
  } catch (error: unknown) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await connectDB();
    // SECURITY: Validate tenant access for authenticated requests
    let tenantId: string;
    try {
      const tenantAccess = await requireTenantAccess(request);
      tenantId = tenantAccess.tenantId;
    } catch (authError: unknown) {
      if (authError.message.includes('Unauthorized') || authError.message.includes('Forbidden')) {
        return NextResponse.json(
          { success: false, error: authError.message },
          { status: authError.message.includes('Unauthorized') ? 401 : 403 }
        );
      }
      throw authError;
    }
    const { id } = await params;
    
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
      // Merge with existing product data for validation
      const oldProduct = await Product.findOne({ _id: id, tenantId }).lean();
      if (oldProduct) {
        const mergedData = { ...oldProduct, ...data };
        const businessValidation = validateProductForBusiness(mergedData, tenantSettings);
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
      }
    }

    const oldProduct = await Product.findOne({ _id: id, tenantId }).lean();
    if (!oldProduct) {
      return NextResponse.json({ success: false, error: 'Product not found' }, { status: 404 });
    }
    const product = await Product.findOneAndUpdate(
      { _id: id, tenantId },
      data,
      { new: true, runValidators: true }
    );
    
    if (!product) {
      return NextResponse.json({ success: false, error: 'Product not found' }, { status: 404 });
    }

    // Track changes
    const changes: Record<string, unknown> = {};
    Object.keys(data).forEach(key => {
      if (oldProduct[key as keyof typeof oldProduct] !== data[key]) {
        changes[key] = {
          old: oldProduct[key as keyof typeof oldProduct],
          new: data[key],
        };
      }
    });

    await createAuditLog(request, {
      tenantId,
      action: AuditActions.UPDATE,
      entityType: 'product',
      entityId: id,
      changes,
    });
    
    return NextResponse.json({ success: true, data: product });
  } catch (error: unknown) {
    return handleApiError(error);
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await connectDB();
    // SECURITY: Validate tenant access for authenticated requests
    let tenantId: string;
    try {
      const tenantAccess = await requireTenantAccess(request);
      tenantId = tenantAccess.tenantId;
    } catch (authError: unknown) {
      if (authError.message.includes('Unauthorized') || authError.message.includes('Forbidden')) {
        return NextResponse.json(
          { success: false, error: authError.message },
          { status: authError.message.includes('Unauthorized') ? 401 : 403 }
        );
      }
      throw authError;
    }
    const { id } = await params;
    
    const product = await Product.findOneAndDelete({ _id: id, tenantId });
    
    if (!product) {
      return NextResponse.json({ success: false, error: 'Product not found' }, { status: 404 });
    }

    await createAuditLog(request, {
      tenantId,
      action: AuditActions.DELETE,
      entityType: 'product',
      entityId: id,
      changes: { name: product.name },
    });
    
    return NextResponse.json({ success: true, data: {} });
  } catch (error: unknown) {
    return handleApiError(error);
  }
}

