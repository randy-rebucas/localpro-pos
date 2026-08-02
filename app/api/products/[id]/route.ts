import { NextRequest, NextResponse } from 'next/server';
import { requireTenantAccess } from '@/lib/api-tenant';
import { hasTenantPermission } from '@/lib/permissions-server';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { validateAndSanitize, validateProduct } from '@/lib/validation';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { handleApiError } from '@/lib/error-handler';
import { getTenantSettingsById } from '@/lib/tenant';
import { validateProductForBusiness } from '@/lib/business-type-helpers';
import { getProductById, updateProductById, softDeleteProduct, serializeProduct } from '@/lib/data/products';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    // Require authentication to prevent unauthenticated product lookups
    const authResult = await requireTenantAccess(request);
    if (authResult instanceof NextResponse) return authResult;
    const tenantId = authResult.tenantId;
    const { id } = await params;

    if (!tenantId) {
      return NextResponse.json({ success: false, error: 'Tenant not found or access denied' }, { status: 403 });
    }

    const product = await getProductById(tenantId, id, true);

    if (!product) {
      return NextResponse.json({ success: false, error: 'Product not found' }, { status: 404 });
    }

    // Ensure boolean fields are properly set
    const productData = {
      ...serializeProduct(product),
      trackInventory: product.trackInventory !== undefined ? Boolean(product.trackInventory) : true,
      allowOutOfStockSales: product.allowOutOfStockSales !== undefined ? Boolean(product.allowOutOfStockSales) : false,
    };

    return NextResponse.json({ success: true, data: productData });
  } catch (error) {
    return handleApiError(error, 'Failed to fetch product');
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    // SECURITY: Validate tenant access for authenticated requests
    let tenantId: string;
    try {
      const tenantAccess = await requireTenantAccess(request);
      tenantId = tenantAccess.tenantId;
      if (!(await hasTenantPermission(tenantAccess.user.role, tenantId, 'products.manage'))) {
        return NextResponse.json(
          { success: false, error: 'Forbidden: Insufficient permissions' },
          { status: 403 }
        );
      }
    } catch (authError: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
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
    const oldProduct = await getProductById(tenantId, id);
    if (!oldProduct) {
      return NextResponse.json({ success: false, error: 'Product not found' }, { status: 404 });
    }

    if (tenantSettings) {
      // Merge with existing product data for validation
      const mergedData = { ...serializeProduct(oldProduct), ...data };
      const { _id, tenantId: _tenantId, createdAt, updatedAt, ...plainProduct } = mergedData as any; // eslint-disable-line @typescript-eslint/no-explicit-any
      const businessValidation = validateProductForBusiness(plainProduct, tenantSettings);
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

    const product = await updateProductById(tenantId, id, data);

    // Track changes
    const oldSerialized = serializeProduct(oldProduct) as Record<string, unknown>;
    const changes: Record<string, any> = {}; // eslint-disable-line @typescript-eslint/no-explicit-any
    Object.keys(data).forEach(key => {
      if (oldSerialized[key] !== (data as Record<string, unknown>)[key]) {
        changes[key] = {
          old: oldSerialized[key],
          new: (data as Record<string, unknown>)[key],
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

    return NextResponse.json({ success: true, data: serializeProduct(product) });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    return handleApiError(error);
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    // SECURITY: Validate tenant access for authenticated requests
    let tenantId: string;
    try {
      const tenantAccess = await requireTenantAccess(request);
      tenantId = tenantAccess.tenantId;
      if (!(await hasTenantPermission(tenantAccess.user.role, tenantId, 'products.manage'))) {
        return NextResponse.json(
          { success: false, error: 'Forbidden: Insufficient permissions' },
          { status: 403 }
        );
      }
    } catch (authError: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
      if (authError.message.includes('Unauthorized') || authError.message.includes('Forbidden')) {
        return NextResponse.json(
          { success: false, error: authError.message },
          { status: authError.message.includes('Unauthorized') ? 401 : 403 }
        );
      }
      throw authError;
    }
    const { id } = await params;

    const product = await softDeleteProduct(tenantId, id);

    if (!product) {
      return NextResponse.json({ success: false, error: 'Product not found' }, { status: 404 });
    }

    await createAuditLog(request, {
      tenantId,
      action: AuditActions.DELETE,
      entityType: 'product',
      entityId: id,
      changes: { name: product.name, softDeleted: true },
    });

    return NextResponse.json({ success: true, data: {} });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    return handleApiError(error);
  }
}
