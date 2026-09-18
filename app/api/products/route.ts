import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import prisma from '@/lib/db';
import { requireTenantAccess } from '@/lib/api-tenant';
import { hasTenantPermission } from '@/lib/permissions-server';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { validateAndSanitize, validateProduct } from '@/lib/validation';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { checkSubscriptionLimit, SubscriptionService } from '@/lib/subscription';
import { logger } from '@/lib/logger';
import { checkRateLimit } from '@/lib/rate-limit';
import { handleApiError } from '@/lib/error-handler';
import { Prisma } from '@prisma/client';

const PRODUCT_INCLUDE = {
  categoryRef: { select: { id: true, name: true } },
  variations: true,
  branchStock: true,
  modifiers: { include: { options: true } },
  restaurantDetails: true,
  laundryDetails: true,
  serviceDetails: true,
  pharmacyDetails: true,
} satisfies Prisma.ProductInclude;

type ProductWithRelations = Prisma.ProductGetPayload<{ include: typeof PRODUCT_INCLUDE }>;

// Maps a product row (with its normalized child-table relations) back to the
// flat/nested shape the frontend and old Mongoose schema exposed, so response
// shapes stay identical across the Mongo -> Postgres migration.
function toProductJSON(p: ProductWithRelations) {
  const {
    categoryRef,
    variations,
    branchStock,
    modifiers,
    restaurantDetails,
    laundryDetails,
    serviceDetails,
    pharmacyDetails,
    ...rest
  } = p;

  return {
    ...rest,
    _id: p.id,
    price: Number(p.price),
    categoryId: p.categoryId ?? undefined,
    categoryName: categoryRef?.name,
    variations: variations.map((v) => ({
      _id: v.id,
      size: v.size ?? undefined,
      color: v.color ?? undefined,
      type: v.type ?? undefined,
      sku: v.sku ?? undefined,
      price: v.price != null ? Number(v.price) : undefined,
      stock: v.stock,
    })),
    branchStock: branchStock.map((b) => ({
      _id: b.id,
      branchId: b.branchId,
      stock: b.stock,
    })),
    modifiers: modifiers.map((m) => ({
      _id: m.id,
      name: m.name,
      required: m.required,
      options: m.options.map((o) => ({ name: o.name, price: Number(o.price) })),
    })),
    allergens: restaurantDetails?.allergens ?? undefined,
    nutritionInfo: restaurantDetails
      ? {
          calories: restaurantDetails.calories ?? undefined,
          protein: restaurantDetails.protein != null ? Number(restaurantDetails.protein) : undefined,
          carbs: restaurantDetails.carbs != null ? Number(restaurantDetails.carbs) : undefined,
          fat: restaurantDetails.fat != null ? Number(restaurantDetails.fat) : undefined,
        }
      : undefined,
    serviceType: laundryDetails?.serviceType
      ? laundryDetails.serviceType === 'dry_clean'
        ? 'dry-clean'
        : laundryDetails.serviceType
      : undefined,
    weightBased: laundryDetails?.weightBased,
    pickupDelivery: laundryDetails?.pickupDelivery,
    estimatedDuration: laundryDetails?.estimatedDuration ?? serviceDetails?.serviceDuration ?? undefined,
    serviceDuration: serviceDetails?.serviceDuration ?? undefined,
    staffRequired: serviceDetails?.staffRequired,
    equipmentRequired: serviceDetails?.equipmentRequired,
    genericName: pharmacyDetails?.genericName ?? undefined,
    manufacturer: pharmacyDetails?.manufacturer ?? undefined,
    prn: pharmacyDetails?.prn ?? undefined,
    batchNumber: pharmacyDetails?.batchNumber ?? undefined,
    expiryDate: pharmacyDetails?.expiryDate ?? undefined,
    drugSchedule: pharmacyDetails?.drugSchedule ?? undefined,
    requiresPrescription: pharmacyDetails?.requiresPrescription,
    storageConditions: pharmacyDetails?.storageConditions ?? undefined,
    activeIngredient: pharmacyDetails?.activeIngredient ?? undefined,
    dosageStrength: pharmacyDetails?.dosageStrength ?? undefined,
    dosageForm: pharmacyDetails?.dosageForm ?? undefined,
  };
}

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
    const isActiveParam = searchParams.get('isActive');
    const filterParam = searchParams.get('filter'); // 'missing-barcode' | 'missing-image' | null

    const where: Prisma.ProductWhereInput = { tenantId };
    if (isActiveParam === 'true') {
      where.isActive = { not: false };
    } else if (isActiveParam === 'false') {
      where.isActive = false;
    } else if (isActiveParam === 'all') {
      // no isActive filter
    } else {
      where.isActive = { not: false };
    }

    // Pre-set filters for the mobile bulk-scan workflow
    let filterOr: Prisma.ProductWhereInput[] | undefined;
    if (filterParam === 'missing-barcode') {
      filterOr = [{ barcode: null }, { barcode: '' }];
    } else if (filterParam === 'missing-image') {
      filterOr = [{ image: null }, { image: '' }];
    }

    let searchOr: Prisma.ProductWhereInput[] | undefined;
    if (search) {
      searchOr = [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
        { sku: { contains: search, mode: 'insensitive' } },
        { barcode: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (filterOr && searchOr) {
      where.AND = [{ OR: filterOr }, { OR: searchOr }];
    } else if (filterOr) {
      where.OR = filterOr;
    } else if (searchOr) {
      where.OR = searchOr;
    }

    if (category) {
      where.category = category;
    }
    if (categoryId) {
      where.categoryId = categoryId;
    }

    const rawPage = parseInt(searchParams.get('page') || '0', 10);
    const rawLimit = parseInt(searchParams.get('limit') || '0', 10);
    const usePagination = rawPage > 0 && rawLimit > 0;
    const page = usePagination ? Math.max(1, rawPage) : 1;
    const limit = usePagination ? Math.min(Math.max(1, rawLimit), 100) : 0;
    const orderBy: Prisma.ProductOrderByWithRelationInput[] = [{ pinned: 'desc' }, { createdAt: 'desc' }];

    if (usePagination) {
      const skip = (page - 1) * limit;
      const [products, total] = await Promise.all([
        prisma.product.findMany({
          where,
          include: PRODUCT_INCLUDE,
          orderBy,
          skip,
          take: limit,
        }),
        prisma.product.count({ where }),
      ]);

      return NextResponse.json({
        success: true,
        data: products.map(toProductJSON),
        pagination: {
          total,
          page,
          limit,
          pages: Math.max(1, Math.ceil(total / limit)),
        },
      });
    }

    const products = await prisma.product.findMany({
      where,
      include: PRODUCT_INCLUDE,
      orderBy,
    });

    return NextResponse.json({ success: true, data: products.map(toProductJSON) });
  } catch (error) {
    return handleApiError(error, 'Failed to fetch products');
  }
}

function mapServiceType(value: unknown): 'wash' | 'dry_clean' | 'press' | 'repair' | 'other' | undefined {
  if (typeof value !== 'string') return undefined;
  if (value === 'dry-clean') return 'dry_clean';
  if (['wash', 'press', 'repair', 'other'].includes(value)) return value as 'wash' | 'press' | 'repair' | 'other';
  return undefined;
}

// Builds the nested-create payload for a product's child tables from the raw
// request body, mirroring what the old embedded Mongoose arrays/subdocuments
// accepted directly on the Product document.
function buildNestedCreateInput(data: Record<string, unknown>): Partial<Prisma.ProductUncheckedCreateInput> {
  const nested: Partial<Prisma.ProductUncheckedCreateInput> = {};

  if (Array.isArray(data.variations) && data.variations.length > 0) {
    nested.variations = {
      create: (data.variations as Record<string, unknown>[]).map((v) => ({
        id: randomUUID(),
        size: typeof v.size === 'string' ? v.size : undefined,
        color: typeof v.color === 'string' ? v.color : undefined,
        type: typeof v.type === 'string' ? v.type : undefined,
        sku: typeof v.sku === 'string' ? v.sku : undefined,
        price: typeof v.price === 'number' ? v.price : undefined,
        stock: typeof v.stock === 'number' ? v.stock : 0,
      })),
    };
  }

  if (Array.isArray(data.branchStock) && data.branchStock.length > 0) {
    nested.branchStock = {
      create: (data.branchStock as Record<string, unknown>[])
        .filter((b) => typeof b.branchId === 'string')
        .map((b) => ({
          id: randomUUID(),
          branchId: b.branchId as string,
          stock: typeof b.stock === 'number' ? b.stock : 0,
        })),
    };
  }

  if (Array.isArray(data.modifiers) && data.modifiers.length > 0) {
    nested.modifiers = {
      create: (data.modifiers as Record<string, unknown>[]).map((m) => ({
        id: randomUUID(),
        name: typeof m.name === 'string' ? m.name : '',
        required: typeof m.required === 'boolean' ? m.required : false,
        options: {
          create: Array.isArray(m.options)
            ? (m.options as Record<string, unknown>[]).map((o) => ({
                id: randomUUID(),
                name: typeof o.name === 'string' ? o.name : '',
                price: typeof o.price === 'number' ? o.price : 0,
              }))
            : [],
        },
      })),
    };
  }

  const nutritionInfo = data.nutritionInfo as Record<string, unknown> | undefined;
  if (Array.isArray(data.allergens) || nutritionInfo) {
    nested.restaurantDetails = {
      create: {
        allergens: Array.isArray(data.allergens) ? (data.allergens as string[]) : [],
        calories: typeof nutritionInfo?.calories === 'number' ? nutritionInfo.calories : undefined,
        protein: typeof nutritionInfo?.protein === 'number' ? nutritionInfo.protein : undefined,
        carbs: typeof nutritionInfo?.carbs === 'number' ? nutritionInfo.carbs : undefined,
        fat: typeof nutritionInfo?.fat === 'number' ? nutritionInfo.fat : undefined,
      },
    };
  }

  const serviceType = mapServiceType(data.serviceType);
  if (
    serviceType !== undefined ||
    data.weightBased !== undefined ||
    data.pickupDelivery !== undefined ||
    data.estimatedDuration !== undefined
  ) {
    nested.laundryDetails = {
      create: {
        serviceType,
        weightBased: typeof data.weightBased === 'boolean' ? data.weightBased : undefined,
        pickupDelivery: typeof data.pickupDelivery === 'boolean' ? data.pickupDelivery : undefined,
        estimatedDuration: typeof data.estimatedDuration === 'number' ? data.estimatedDuration : undefined,
      },
    };
  }

  if (
    data.serviceDuration !== undefined ||
    data.staffRequired !== undefined ||
    data.equipmentRequired !== undefined
  ) {
    nested.serviceDetails = {
      create: {
        serviceDuration: typeof data.serviceDuration === 'number' ? data.serviceDuration : undefined,
        staffRequired: typeof data.staffRequired === 'number' ? data.staffRequired : undefined,
        equipmentRequired: Array.isArray(data.equipmentRequired) ? (data.equipmentRequired as string[]) : undefined,
      },
    };
  }

  const pharmacyKeys = [
    'genericName', 'manufacturer', 'prn', 'batchNumber', 'expiryDate',
    'drugSchedule', 'requiresPrescription', 'storageConditions',
    'activeIngredient', 'dosageStrength', 'dosageForm',
  ];
  if (pharmacyKeys.some((k) => data[k] !== undefined)) {
    nested.pharmacyDetails = {
      create: {
        genericName: typeof data.genericName === 'string' ? data.genericName : undefined,
        manufacturer: typeof data.manufacturer === 'string' ? data.manufacturer : undefined,
        prn: typeof data.prn === 'string' ? data.prn : undefined,
        batchNumber: typeof data.batchNumber === 'string' ? data.batchNumber : undefined,
        expiryDate: typeof data.expiryDate === 'string' ? new Date(data.expiryDate) : undefined,
        drugSchedule: ['otc', 'rx', 'dangerous'].includes(data.drugSchedule as string)
          ? (data.drugSchedule as 'otc' | 'rx' | 'dangerous')
          : undefined,
        requiresPrescription: typeof data.requiresPrescription === 'boolean' ? data.requiresPrescription : undefined,
        storageConditions: typeof data.storageConditions === 'string' ? data.storageConditions : undefined,
        activeIngredient: typeof data.activeIngredient === 'string' ? data.activeIngredient : undefined,
        dosageStrength: typeof data.dosageStrength === 'string' ? data.dosageStrength : undefined,
        dosageForm: typeof data.dosageForm === 'string' ? data.dosageForm : undefined,
      },
    };
  }

  return nested;
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

    // Warn on likely duplicates (same name, case-insensitive) instead of silently creating
    // a second product — this is how duplicate SKUs for the same item have crept in before.
    // Callers that intend to create anyway (confirmed by the user) pass confirmDuplicate: true.
    if (!body.confirmDuplicate) {
      const possibleDuplicate = await prisma.product.findFirst({
        where: {
          tenantId,
          isActive: { not: false },
          name: { equals: String(data.name).trim(), mode: 'insensitive' },
        },
        select: { id: true, name: true, sku: true, stock: true },
      });

      if (possibleDuplicate) {
        return NextResponse.json(
          {
            success: false,
            error: 'A product with this name already exists',
            code: 'DUPLICATE_PRODUCT_NAME',
            existingProduct: { ...possibleDuplicate, _id: possibleDuplicate.id },
          },
          { status: 409 }
        );
      }
    }

    // Check subscription limits
    const currentProductCount = await prisma.product.count({ where: { tenantId, isActive: true } });
    try {
      await checkSubscriptionLimit(tenantId.toString(), 'maxProducts', currentProductCount);
    } catch (limitError: unknown) {
      return NextResponse.json(
        { success: false, error: (limitError as Error).message },
        { status: 403 }
      );
    }

    const {
      variations: _v, branchStock: _bs, modifiers: _m, allergens: _a, nutritionInfo: _n,
      serviceType: _st, weightBased: _wb, pickupDelivery: _pd, estimatedDuration: _ed,
      serviceDuration: _sd, staffRequired: _sr, equipmentRequired: _er,
      genericName: _gn, manufacturer: _mf, prn: _prn, batchNumber: _bn, expiryDate: _exd,
      drugSchedule: _ds, requiresPrescription: _rp, storageConditions: _sc,
      activeIngredient: _ai, dosageStrength: _dos, dosageForm: _df,
      ...scalarData
    } = data as Record<string, unknown>;

    let product;
    try {
      product = await prisma.product.create({
        data: {
          ...(scalarData as Prisma.ProductUncheckedCreateInput),
          id: randomUUID(),
          tenantId,
          ...buildNestedCreateInput(data as Record<string, unknown>),
        },
        include: PRODUCT_INCLUDE,
      });
    } catch (err: unknown) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const target = (err.meta?.target as string[] | undefined) ?? [];
        if (target.some((f) => f.includes('barcode'))) {
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
      throw err;
    }

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

    return NextResponse.json({ success: true, data: toProductJSON(product) }, { status: 201 });
  } catch (error: unknown) {
    return handleApiError(error, 'Failed to create product');
  }
}
