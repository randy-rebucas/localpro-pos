import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Product from '@/models/Product';
import { getTenantIdFromRequest, requireTenantAccess } from '@/lib/api-tenant';
import { requireAuth } from '@/lib/auth'; // eslint-disable-line @typescript-eslint/no-unused-vars
import { createAuditLog, AuditActions } from '@/lib/audit';
import { validateAndSanitize, validateProduct } from '@/lib/validation';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { checkSubscriptionLimit, SubscriptionService } from '@/lib/subscription';

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

    const query: any = { tenantId }; // eslint-disable-line @typescript-eslint/no-explicit-any
    if (search) {
      const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      query.$or = [
        { name: { $regex: escapedSearch, $options: 'i' } },
        { description: { $regex: escapedSearch, $options: 'i' } },
        { sku: { $regex: escapedSearch, $options: 'i' } },
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
  } catch (_error: unknown) {
    console.error('Error fetching products:', _error);
    return NextResponse.json({ success: false, error: 'Failed to fetch products' }, { status: 500 });
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
    } catch (authError: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
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

    // Check subscription limits
    const currentProductCount = await Product.countDocuments({ tenantId, isActive: true });
    try {
      await checkSubscriptionLimit(tenantId.toString(), 'maxProducts', currentProductCount);
    } catch (limitError: unknown) {
      return NextResponse.json(
        { success: false, error: (limitError as Error).message },
        { status: 403 }
      );
    }

    const product = await Product.create({ ...data, tenantId });

    await createAuditLog(request, {
      tenantId,
      action: AuditActions.CREATE,
      entityType: 'product',
      entityId: product._id.toString(),
      changes: data,
    });

    // Update subscription usage
    try {
      await SubscriptionService.updateUsage(tenantId.toString(), {
        products: currentProductCount + 1
      });
    } catch (usageError) {
      console.error('Failed to update subscription usage:', usageError);
      // Don't fail the request if usage update fails
    }

    return NextResponse.json({ success: true, data: product }, { status: 201 });
  } catch (error: unknown) {
    if ((error as Record<string, unknown>).code === 11000) {
      return NextResponse.json(
        { success: false, error: 'Product with this SKU already exists' },
        { status: 400 }
      );
    }
    console.error('Error creating product:', error);
    return NextResponse.json({ success: false, error: 'Failed to create product' }, { status: 400 });
  }
}

