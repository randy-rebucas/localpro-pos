import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Product from '@/models/Product';
import { requireTenantAccess } from '@/lib/api-tenant';
import { hasTenantPermission } from '@/lib/permissions-server';
import { findVariationProblem, normalizeVariationRows } from '@/lib/product-variations';
import { findTakenVariationSku, saveVariationRows, variationProblemMessage } from '@/lib/product-variations-save';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { validateAndSanitize, validateProduct } from '@/lib/validation';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { handleApiError } from '@/lib/error-handler';
import { getTenantSettingsById } from '@/lib/tenant';
import { pickProductFields, findTenantCategory } from '@/lib/product-input';
import { updateStock } from '@/lib/stock';
import { checkSubscriptionLimit } from '@/lib/subscription';
import { validateProductForBusiness } from '@/lib/business-type-helpers';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await connectDB();

    // Require authentication to prevent unauthenticated product lookups
    const authResult = await requireTenantAccess(request);
    if (authResult instanceof NextResponse) return authResult;
    const tenantId = authResult.tenantId;
    const { id } = await params;

    if (!tenantId) {
      return NextResponse.json({ success: false, error: 'Tenant not found or access denied' }, { status: 403 });
    }

    const product = await Product.findOne({ _id: id, tenantId, isActive: { $ne: false } }).lean();

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
  } catch (error) {
    return handleApiError(error, 'Failed to fetch product');
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await connectDB();
    // SECURITY: Validate tenant access for authenticated requests
    let tenantId: string;
    let actorId: string | undefined;
    try {
      const tenantAccess = await requireTenantAccess(request);
      tenantId = tenantAccess.tenantId;
      actorId = tenantAccess.user.userId;
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

    const oldProduct = await Product.findOne({ _id: id, tenantId }).lean();
    if (!oldProduct) {
      return NextResponse.json({ success: false, error: 'Product not found' }, { status: 404 });
    }

    // The edit form only sends stock when the count was changed; validate the
    // rest against the current figure.
    const stockSent = body.stock !== undefined;
    const { data, errors } = validateAndSanitize(
      stockSent ? body : { ...body, stock: oldProduct.stock ?? 0 },
      validateProduct,
      t
    );

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
      {
        const mergedData = { ...oldProduct, ...data };
        // Remove Mongoose internals before validation
        const {
          _id,
          tenantId,
          __v,
          createdAt,
          updatedAt,
          collection,
          db,
          isNew,
          errors: docErrors,
          ...plainProduct
        } = mergedData as any; // eslint-disable-line @typescript-eslint/no-explicit-any
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
    }

    // Only the product's own fields; stock, variations, branch stock, status and
    // pinning each have their own path (see lib/product-input.ts).
    const { set: updates, unset } = pickProductFields(data as Record<string, unknown>);

    if ('categoryId' in updates) {
      const category = await findTenantCategory(tenantId, updates.categoryId);
      if (!category) {
        return NextResponse.json({ success: false, errors: [{ field: 'categoryId', message: t('validation.categoryNotFound', 'Category not found'), code: 'categoryNotFound' }] }, { status: 400 });
      }
      updates.category = category.name;
    } else if (unset.includes('categoryId')) {
      unset.push('category');
    }

    const existingVariations = oldProduct.variations ?? [];
    const variationRows = normalizeVariationRows(body.variations);
    if (variationRows) {
      const problem = findVariationProblem(variationRows, existingVariations);
      const takenSku = problem ? null : await findTakenVariationSku(tenantId, variationRows, id);
      const message = problem
        ? variationProblemMessage(problem.code, problem.label, t)
        : takenSku ? variationProblemMessage('duplicate_sku', takenSku, t) : null;
      if (message) {
        return NextResponse.json({ success: false, errors: [{ field: 'variations', message, code: 'variations' }] }, { status: 400 });
      }
    }

    const update: Record<string, unknown> = {};
    if (Object.keys(updates).length) update.$set = updates;
    if (unset.length) update.$unset = Object.fromEntries(unset.map((field) => [field, '']));

    const updated = Object.keys(update).length
      ? await Product.findOneAndUpdate({ _id: id, tenantId }, update, { new: true, runValidators: true })
      : await Product.findOne({ _id: id, tenantId });

    if (!updated) {
      return NextResponse.json({ success: false, error: 'Product not found' }, { status: 404 });
    }

    const variationChanges = variationRows ? await saveVariationRows(tenantId, id, variationRows, existingVariations) : undefined;

    // A count typed into the form is a stock adjustment: it goes through the
    // ledger as a delta against the *current* figure, so sales made while the
    // form was open are kept and the change shows in stock movements.
    // Variations hold their own stock, so the main figure is left alone there.
    let stockChange: { old: number; new: number } | undefined;
    const typedStock = data.stock as number;
    if (stockSent && !oldProduct.hasVariations && !variationRows?.length && updated.trackInventory !== false) {
      const current = updated.stock ?? 0;
      if (typedStock !== current) {
        await updateStock(id, tenantId, typedStock - current, 'adjustment', {
          userId: actorId,
          reason: 'Stock count edited in product form',
        });
        stockChange = { old: current, new: typedStock };
      }
    }

    const product = variationRows || stockChange ? await Product.findOne({ _id: id, tenantId }) : updated;

    if (!product) {
      return NextResponse.json({ success: false, error: 'Product not found' }, { status: 404 });
    }

    // Track changes
    const changes: Record<string, any> = {}; // eslint-disable-line @typescript-eslint/no-explicit-any
    Object.keys(updates).forEach(key => {
      if (oldProduct[key as keyof typeof oldProduct] !== updates[key]) {
        changes[key] = {
          old: oldProduct[key as keyof typeof oldProduct],
          new: updates[key],
        };
      }
    });
    for (const key of unset) {
      const old = oldProduct[key as keyof typeof oldProduct];
      if (old !== undefined && old !== null && old !== '') changes[key] = { old, new: null };
    }
    if (stockChange) changes.stock = stockChange;
    if (variationChanges) changes.variations = variationChanges;

    await createAuditLog(request, {
      tenantId,
      action: AuditActions.UPDATE,
      entityType: 'product',
      entityId: id,
      changes,
    });
    
    return NextResponse.json({ success: true, data: product });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    return handleApiError(error);
  }
}

// Partial update for fields that don't require full product validation (e.g. reactivating a
// soft-deleted product, where PUT's required name/price/stock checks would otherwise reject it).
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await connectDB();
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

    const updates: Record<string, unknown> = {};
    if (typeof body.isActive === 'boolean') {
      updates.isActive = body.isActive;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ success: false, error: 'No valid fields to update' }, { status: 400 });
    }

    const oldProduct = await Product.findOne({ _id: id, tenantId }).lean();
    if (!oldProduct) {
      return NextResponse.json({ success: false, error: 'Product not found' }, { status: 404 });
    }

    // Reactivating counts against the plan like creating does — otherwise
    // delete, create new, reactivate old gets past maxProducts.
    if (updates.isActive === true && oldProduct.isActive === false) {
      const activeCount = await Product.countDocuments({ tenantId, isActive: true });
      try {
        await checkSubscriptionLimit(tenantId.toString(), 'maxProducts', activeCount);
      } catch (limitError: unknown) {
        return NextResponse.json({ success: false, error: (limitError as Error).message }, { status: 403 });
      }
    }

    const product = await Product.findOneAndUpdate({ _id: id, tenantId }, updates, { new: true });

    await createAuditLog(request, {
      tenantId,
      action: AuditActions.UPDATE,
      entityType: 'product',
      entityId: id,
      changes: Object.fromEntries(
        Object.keys(updates).map((key) => [
          key,
          { old: oldProduct[key as keyof typeof oldProduct], new: updates[key] },
        ])
      ),
    });

    return NextResponse.json({ success: true, data: product });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
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
    
    const product = await Product.findOneAndUpdate(
      { _id: id, tenantId, isActive: true },
      { isActive: false },
      { new: true }
    );

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

