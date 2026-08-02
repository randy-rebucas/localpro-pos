import { NextRequest, NextResponse } from 'next/server';
import { requireTenantAccess } from '@/lib/api-tenant';
import { hasTenantPermission } from '@/lib/permissions-server';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { validateAndSanitize, validateProduct } from '@/lib/validation';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { checkSubscriptionLimit, SubscriptionService } from '@/lib/subscription';
import { logger } from '@/lib/logger';
import { checkRateLimit } from '@/lib/rate-limit';
import { handleApiError } from '@/lib/error-handler';
import { findProducts, createProduct, countActiveProducts, serializeProduct } from '@/lib/data/products';

export async function GET(request: NextRequest) {
  try {
    // Require authentication to prevent unauthenticated product enumeration
    const authResult = await requireTenantAccess(request);
    if (authResult instanceof NextResponse) return authResult;
    const tenantId = authResult.tenantId;

    if (!tenantId) {
      return NextResponse.json({ success: false, error: 'Tenant not found or access denied' }, { status: 403 });
    }

    const searchParams = request.nextUrl.searchParams;
    const search = searchParams.get('search') || '';
    const category = searchParams.get('category') || '';
    const categoryId = searchParams.get('categoryId') || '';
    const isActiveParam = searchParams.get('isActive') as 'true' | 'false' | 'all' | null;
    const filterParam = searchParams.get('filter') as 'missing-barcode' | 'missing-image' | null;

    const rawPage = parseInt(searchParams.get('page') || '0', 10);
    const rawLimit = parseInt(searchParams.get('limit') || '0', 10);
    const usePagination = rawPage > 0 && rawLimit > 0;
    const page = usePagination ? Math.max(1, rawPage) : 1;
    const limit = usePagination ? Math.min(Math.max(1, rawLimit), 100) : 0;

    const filters = { search, category, categoryId, isActive: isActiveParam, filter: filterParam };

    if (usePagination) {
      const skip = (page - 1) * limit;
      const { products, total } = await findProducts(tenantId, filters, { skip, limit });

      return NextResponse.json({
        success: true,
        data: products,
        pagination: {
          total,
          page,
          limit,
          pages: Math.max(1, Math.ceil(total / limit)),
        },
      });
    }

    const { products } = await findProducts(tenantId, filters);

    return NextResponse.json({ success: true, data: products });
  } catch (error) {
    return handleApiError(error, 'Failed to fetch products');
  }
}

export async function POST(request: NextRequest) {
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

    const ip = request.headers.get('x-forwarded-for') ?? 'unknown';
    const { allowed } = checkRateLimit(`write:products:${tenantId}:${ip}`, 30, 60_000);
    if (!allowed) {
      return NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429 });
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
    const currentProductCount = await countActiveProducts(tenantId);
    try {
      await checkSubscriptionLimit(tenantId.toString(), 'maxProducts', currentProductCount);
    } catch (limitError: unknown) {
      return NextResponse.json(
        { success: false, error: (limitError as Error).message },
        { status: 403 }
      );
    }

    const product = await createProduct(tenantId, data);

    await createAuditLog(request, {
      tenantId,
      action: AuditActions.CREATE,
      entityType: 'product',
      entityId: product.id,
      changes: data,
    });

    // Update subscription usage
    try {
      await SubscriptionService.updateUsage(tenantId.toString(), {
        products: currentProductCount + 1
      });
    } catch (usageError) {
      logger.error('Failed to update subscription usage:', usageError);
      // Don't fail the request if usage update fails
    }

    return NextResponse.json({ success: true, data: serializeProduct(product) }, { status: 201 });
  } catch (error: unknown) {
    if ((error as Record<string, unknown>).code === 'P2002') {
      const target = (error as any)?.meta?.target; // eslint-disable-line @typescript-eslint/no-explicit-any
      if (Array.isArray(target) && target.includes('barcode')) {
        return NextResponse.json(
          { success: false, error: 'A product with this barcode already exists' },
          { status: 400 }
        );
      }
      return NextResponse.json(
        { success: false, error: 'Product with this SKU already exists' },
        { status: 400 }
      );
    }
    return handleApiError(error, 'Failed to create product');
  }
}
