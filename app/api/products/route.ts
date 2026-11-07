import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Product from '@/models/Product';
import Category from '@/models/Category';
import { requireTenantAccess } from '@/lib/api-tenant';
import { hasTenantPermission } from '@/lib/permissions-server';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { validateAndSanitize, validateProduct } from '@/lib/validation';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { checkSubscriptionLimit, SubscriptionService } from '@/lib/subscription';
import { logger } from '@/lib/logger';
import { checkRateLimit } from '@/lib/rate-limit';
import { handleApiError } from '@/lib/error-handler';
import { findVariationProblem, normalizeVariationRows } from '@/lib/product-variations';
import { findTakenVariationSku, newVariation, variationProblemMessage } from '@/lib/product-variations-save';

// _id keeps equal values in a fixed order, so paging can't repeat or skip a product
const PRODUCT_SORTS: Record<string, Record<string, 1 | -1>> = {
  name: { name: 1, _id: 1 },
  price_asc: { price: 1, _id: 1 },
  price_desc: { price: -1, _id: 1 },
  stock_asc: { stock: 1, _id: 1 },
  stock_desc: { stock: -1, _id: 1 },
};

export async function GET(request: NextRequest) {
  try {
    await connectDB();

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
    const categoryName = searchParams.get('categoryName') || '';
    const sortKey = searchParams.get('sort') || '';
    const isActiveParam = searchParams.get('isActive');
    const filterParam = searchParams.get('filter'); // 'missing-barcode' | 'missing-image' | null

    const query: any = { tenantId }; // eslint-disable-line @typescript-eslint/no-explicit-any
    if (isActiveParam === 'true') {
      query.isActive = { $ne: false };
    } else if (isActiveParam === 'false') {
      query.isActive = false;
    } else if (isActiveParam === 'all') {
      // no isActive filter
    } else {
      query.isActive = { $ne: false };
    }

    // Pre-set filters for the mobile bulk-scan workflow
    if (filterParam === 'missing-barcode') {
      query.$or = [
        { barcode: { $exists: false } },
        { barcode: null },
        { barcode: '' },
        { barcode: /^\s*$/ },
      ];
    } else if (filterParam === 'missing-image') {
      query.$or = [{ image: { $exists: false } }, { image: null }, { image: '' }];
    }

    if (search) {
      const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const searchOr = [
        { name: { $regex: escapedSearch, $options: 'i' } },
        { description: { $regex: escapedSearch, $options: 'i' } },
        { sku: { $regex: escapedSearch, $options: 'i' } },
        { barcode: { $regex: escapedSearch, $options: 'i' } },
      ];
      // Merge with existing $or if a filter is already applied
      if (query.$or) {
        query.$and = [{ $or: query.$or }, { $or: searchOr }];
        delete query.$or;
      } else {
        query.$or = searchOr;
      }
    }
    if (category) {
      query.category = category;
    }
    if (categoryId) {
      query.categoryId = categoryId;
    }
    // A product may hold its category as text, as a Category record, or both
    if (categoryName) {
      const records = await Category.find({ tenantId, name: categoryName }).select('_id').lean();
      const categoryOr = [
        { category: categoryName },
        ...(records.length > 0 ? [{ categoryId: { $in: records.map((record) => record._id) } }] : []),
      ];
      query.$and = [...(query.$and ?? (query.$or ? [{ $or: query.$or }] : [])), { $or: categoryOr }];
      delete query.$or;
    }

    const rawPage = parseInt(searchParams.get('page') || '0', 10);
    const rawLimit = parseInt(searchParams.get('limit') || '0', 10);
    const usePagination = rawPage > 0 && rawLimit > 0;
    const page = usePagination ? Math.max(1, rawPage) : 1;
    const limit = usePagination ? Math.min(Math.max(1, rawLimit), 100) : 0;
    const sort = Object.hasOwn(PRODUCT_SORTS, sortKey) ? PRODUCT_SORTS[sortKey] : { pinned: -1 as const, createdAt: -1 as const };
    const findProducts = () => {
      const products = Product.find(query).populate('categoryId', 'name').sort(sort);
      return sortKey === 'name' ? products.collation({ locale: 'en', strength: 2 }) : products;
    };

    if (usePagination) {
      const skip = (page - 1) * limit;
      const [products, total] = await Promise.all([
        findProducts()
          .skip(skip)
          .limit(limit)
          .lean(),
        Product.countDocuments(query),
      ]);

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

    const products = await findProducts().lean();

    return NextResponse.json({ success: true, data: products });
  } catch (error) {
    return handleApiError(error, 'Failed to fetch products');
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

    // Warn on likely duplicates (same name, case-insensitive) instead of silently creating
    // a second product — this is how duplicate SKUs for the same item have crept in before.
    // Callers that intend to create anyway (confirmed by the user) pass confirmDuplicate: true.
    if (!body.confirmDuplicate) {
      const escapedName = String(data.name).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const possibleDuplicate = await Product.findOne({
        tenantId,
        isActive: { $ne: false },
        name: { $regex: `^${escapedName}$`, $options: 'i' },
      }).select('_id name sku stock').lean();

      if (possibleDuplicate) {
        return NextResponse.json(
          {
            success: false,
            error: 'A product with this name already exists',
            code: 'DUPLICATE_PRODUCT_NAME',
            existingProduct: possibleDuplicate,
          },
          { status: 409 }
        );
      }
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

    // Variations only come in through the checked rows below
    const { variations: rawVariations, hasVariations: _ignored, ...fields } = data;
    const variationRows = normalizeVariationRows(rawVariations) ?? [];
    const problem = findVariationProblem(variationRows);
    const message = problem
      ? variationProblemMessage(problem.code, problem.label, t)
      : await findTakenVariationSku(tenantId, variationRows).then((sku) => (sku ? variationProblemMessage('duplicate_sku', sku, t) : null));
    if (message) {
      return NextResponse.json({ success: false, errors: [{ field: 'variations', message, code: 'variations' }] }, { status: 400 });
    }

    const product = await Product.create({
      ...fields,
      tenantId,
      hasVariations: variationRows.length > 0,
      variations: variationRows.map(newVariation),
    });

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
      logger.error('Failed to update subscription usage:', usageError);
      // Don't fail the request if usage update fails
    }

    return NextResponse.json({ success: true, data: product }, { status: 201 });
  } catch (error: unknown) {
    if ((error as Record<string, unknown>).code === 11000) {
      const keyPattern = (error as any)?.keyPattern; // eslint-disable-line @typescript-eslint/no-explicit-any
      if (keyPattern?.barcode) {
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

