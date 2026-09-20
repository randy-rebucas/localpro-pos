import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import prisma, { dbTransaction } from '@/lib/db';
import { Prisma } from '@prisma/client';
import { requireTenantAccess } from '@/lib/api-tenant';
import { hasTenantPermission } from '@/lib/permissions-server';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { validateAndSanitize, validateProduct } from '@/lib/validation';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { handleApiError } from '@/lib/error-handler';
import { getTenantSettingsById } from '@/lib/tenant';
import { validateProductForBusiness } from '@/lib/business-type-helpers';

const PRODUCT_INCLUDE = {
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
  const { variations, branchStock, modifiers, restaurantDetails, laundryDetails, serviceDetails, pharmacyDetails, ...rest } = p;

  return {
    ...rest,
    _id: p.id,
    price: Number(p.price),
    variations: variations.map((v) => ({
      _id: v.id,
      size: v.size ?? undefined,
      color: v.color ?? undefined,
      type: v.type ?? undefined,
      sku: v.sku ?? undefined,
      price: v.price != null ? Number(v.price) : undefined,
      stock: v.stock,
    })),
    branchStock: branchStock.map((b) => ({ _id: b.id, branchId: b.branchId, stock: b.stock })),
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
      ? laundryDetails.serviceType === 'dry_clean' ? 'dry-clean' : laundryDetails.serviceType
      : undefined,
    weightBased: laundryDetails?.weightBased,
    pickupDelivery: laundryDetails?.pickupDelivery,
    estimatedDuration: laundryDetails?.estimatedDuration ?? undefined,
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

function mapServiceType(value: unknown): 'wash' | 'dry_clean' | 'press' | 'repair' | 'other' | undefined {
  if (typeof value !== 'string') return undefined;
  if (value === 'dry-clean') return 'dry_clean';
  if (['wash', 'press', 'repair', 'other'].includes(value)) return value as 'wash' | 'press' | 'repair' | 'other';
  return undefined;
}

const CHILD_TABLE_KEYS = [
  'variations', 'branchStock', 'modifiers', 'allergens', 'nutritionInfo',
  'serviceType', 'weightBased', 'pickupDelivery', 'estimatedDuration',
  'serviceDuration', 'staffRequired', 'equipmentRequired',
  'genericName', 'manufacturer', 'prn', 'batchNumber', 'expiryDate',
  'drugSchedule', 'requiresPrescription', 'storageConditions',
  'activeIngredient', 'dosageStrength', 'dosageForm',
];

// Applies the child-table writes (variations, branchStock, modifiers, industry
// details) for an update. Arrays are replaced wholesale (delete + recreate) since
// the client sends the full desired list rather than per-row diffs, same as the
// old embedded-array `$set` semantics. Must run inside the caller's transaction.
async function applyChildTableUpdates(
  tx: Prisma.TransactionClient,
  productId: string,
  data: Record<string, unknown>
) {
  if (data.variations !== undefined) {
    await tx.productVariation.deleteMany({ where: { productId } });
    if (Array.isArray(data.variations) && data.variations.length > 0) {
      await tx.productVariation.createMany({
        data: (data.variations as Record<string, unknown>[]).map((v) => ({
          id: randomUUID(),
          productId,
          size: typeof v.size === 'string' ? v.size : undefined,
          color: typeof v.color === 'string' ? v.color : undefined,
          type: typeof v.type === 'string' ? v.type : undefined,
          sku: typeof v.sku === 'string' ? v.sku : undefined,
          price: typeof v.price === 'number' ? v.price : undefined,
          stock: typeof v.stock === 'number' ? v.stock : 0,
        })),
      });
    }
  }

  if (data.branchStock !== undefined) {
    await tx.productBranchStock.deleteMany({ where: { productId } });
    if (Array.isArray(data.branchStock) && data.branchStock.length > 0) {
      await tx.productBranchStock.createMany({
        data: (data.branchStock as Record<string, unknown>[])
          .filter((b) => typeof b.branchId === 'string')
          .map((b) => ({
            id: randomUUID(),
            productId,
            branchId: b.branchId as string,
            stock: typeof b.stock === 'number' ? b.stock : 0,
          })),
      });
    }
  }

  if (data.modifiers !== undefined) {
    await tx.productModifier.deleteMany({ where: { productId } });
    if (Array.isArray(data.modifiers) && data.modifiers.length > 0) {
      for (const m of data.modifiers as Record<string, unknown>[]) {
        const modifierId = randomUUID();
        await tx.productModifier.create({
          data: {
            id: modifierId,
            productId,
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
          },
        });
      }
    }
  }

  if (data.allergens !== undefined || data.nutritionInfo !== undefined) {
    const nutritionInfo = data.nutritionInfo as Record<string, unknown> | undefined;
    await tx.productRestaurantDetails.upsert({
      where: { productId },
      create: {
        productId,
        allergens: Array.isArray(data.allergens) ? (data.allergens as string[]) : [],
        calories: typeof nutritionInfo?.calories === 'number' ? nutritionInfo.calories : undefined,
        protein: typeof nutritionInfo?.protein === 'number' ? nutritionInfo.protein : undefined,
        carbs: typeof nutritionInfo?.carbs === 'number' ? nutritionInfo.carbs : undefined,
        fat: typeof nutritionInfo?.fat === 'number' ? nutritionInfo.fat : undefined,
      },
      update: {
        allergens: Array.isArray(data.allergens) ? (data.allergens as string[]) : undefined,
        calories: typeof nutritionInfo?.calories === 'number' ? nutritionInfo.calories : undefined,
        protein: typeof nutritionInfo?.protein === 'number' ? nutritionInfo.protein : undefined,
        carbs: typeof nutritionInfo?.carbs === 'number' ? nutritionInfo.carbs : undefined,
        fat: typeof nutritionInfo?.fat === 'number' ? nutritionInfo.fat : undefined,
      },
    });
  }

  const serviceType = mapServiceType(data.serviceType);
  if (
    data.serviceType !== undefined || data.weightBased !== undefined ||
    data.pickupDelivery !== undefined || data.estimatedDuration !== undefined
  ) {
    await tx.productLaundryDetails.upsert({
      where: { productId },
      create: {
        productId,
        serviceType,
        weightBased: typeof data.weightBased === 'boolean' ? data.weightBased : undefined,
        pickupDelivery: typeof data.pickupDelivery === 'boolean' ? data.pickupDelivery : undefined,
        estimatedDuration: typeof data.estimatedDuration === 'number' ? data.estimatedDuration : undefined,
      },
      update: {
        serviceType,
        weightBased: typeof data.weightBased === 'boolean' ? data.weightBased : undefined,
        pickupDelivery: typeof data.pickupDelivery === 'boolean' ? data.pickupDelivery : undefined,
        estimatedDuration: typeof data.estimatedDuration === 'number' ? data.estimatedDuration : undefined,
      },
    });
  }

  if (data.serviceDuration !== undefined || data.staffRequired !== undefined || data.equipmentRequired !== undefined) {
    await tx.productServiceDetails.upsert({
      where: { productId },
      create: {
        productId,
        serviceDuration: typeof data.serviceDuration === 'number' ? data.serviceDuration : undefined,
        staffRequired: typeof data.staffRequired === 'number' ? data.staffRequired : undefined,
        equipmentRequired: Array.isArray(data.equipmentRequired) ? (data.equipmentRequired as string[]) : undefined,
      },
      update: {
        serviceDuration: typeof data.serviceDuration === 'number' ? data.serviceDuration : undefined,
        staffRequired: typeof data.staffRequired === 'number' ? data.staffRequired : undefined,
        equipmentRequired: Array.isArray(data.equipmentRequired) ? (data.equipmentRequired as string[]) : undefined,
      },
    });
  }

  const pharmacyKeys = [
    'genericName', 'manufacturer', 'prn', 'batchNumber', 'expiryDate',
    'drugSchedule', 'requiresPrescription', 'storageConditions',
    'activeIngredient', 'dosageStrength', 'dosageForm',
  ];
  if (pharmacyKeys.some((k) => data[k] !== undefined)) {
    const expiryDate = typeof data.expiryDate === 'string' ? new Date(data.expiryDate) : undefined;
    const drugSchedule = ['otc', 'rx', 'dangerous'].includes(data.drugSchedule as string)
      ? (data.drugSchedule as 'otc' | 'rx' | 'dangerous')
      : undefined;
    await tx.productPharmacyDetails.upsert({
      where: { productId },
      create: {
        productId,
        genericName: typeof data.genericName === 'string' ? data.genericName : undefined,
        manufacturer: typeof data.manufacturer === 'string' ? data.manufacturer : undefined,
        prn: typeof data.prn === 'string' ? data.prn : undefined,
        batchNumber: typeof data.batchNumber === 'string' ? data.batchNumber : undefined,
        expiryDate,
        drugSchedule,
        requiresPrescription: typeof data.requiresPrescription === 'boolean' ? data.requiresPrescription : undefined,
        storageConditions: typeof data.storageConditions === 'string' ? data.storageConditions : undefined,
        activeIngredient: typeof data.activeIngredient === 'string' ? data.activeIngredient : undefined,
        dosageStrength: typeof data.dosageStrength === 'string' ? data.dosageStrength : undefined,
        dosageForm: typeof data.dosageForm === 'string' ? data.dosageForm : undefined,
      },
      update: {
        genericName: typeof data.genericName === 'string' ? data.genericName : undefined,
        manufacturer: typeof data.manufacturer === 'string' ? data.manufacturer : undefined,
        prn: typeof data.prn === 'string' ? data.prn : undefined,
        batchNumber: typeof data.batchNumber === 'string' ? data.batchNumber : undefined,
        expiryDate,
        drugSchedule,
        requiresPrescription: typeof data.requiresPrescription === 'boolean' ? data.requiresPrescription : undefined,
        storageConditions: typeof data.storageConditions === 'string' ? data.storageConditions : undefined,
        activeIngredient: typeof data.activeIngredient === 'string' ? data.activeIngredient : undefined,
        dosageStrength: typeof data.dosageStrength === 'string' ? data.dosageStrength : undefined,
        dosageForm: typeof data.dosageForm === 'string' ? data.dosageForm : undefined,
      },
    });
  }
}

function scalarUpdateData(data: Record<string, unknown>): Prisma.ProductUncheckedUpdateInput {
  const scalar: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (!CHILD_TABLE_KEYS.includes(key)) {
      scalar[key] = value;
    }
  }
  return scalar as Prisma.ProductUncheckedUpdateInput;
}

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

    const product = await prisma.product.findFirst({
      where: { id, tenantId, isActive: { not: false } },
      include: PRODUCT_INCLUDE,
    });

    if (!product) {
      return NextResponse.json({ success: false, error: 'Product not found' }, { status: 404 });
    }

    // Ensure boolean fields are properly set
    const productData = {
      ...toProductJSON(product),
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

    const oldProduct = await prisma.product.findFirst({ where: { id, tenantId }, include: PRODUCT_INCLUDE });
    if (!oldProduct) {
      return NextResponse.json({ success: false, error: 'Product not found' }, { status: 404 });
    }

    // Get tenant settings for business type validation
    const tenantSettings = await getTenantSettingsById(tenantId);
    if (tenantSettings) {
      // Merge with existing product data for validation
      const mergedData = { ...toProductJSON(oldProduct), ...(data as Record<string, unknown>) };
      const { _id, tenantId: _t, id: _pid, createdAt, updatedAt, ...plainProduct } = mergedData as any; // eslint-disable-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars
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

    const scalarData = scalarUpdateData(data as Record<string, unknown>);

    const product = await dbTransaction(async (tx) => {
      await tx.product.update({ where: { id }, data: scalarData });
      await applyChildTableUpdates(tx, id, data as Record<string, unknown>);
      return tx.product.findUniqueOrThrow({ where: { id }, include: PRODUCT_INCLUDE });
    });

    // Track changes
    const oldJSON = toProductJSON(oldProduct) as Record<string, unknown>;
    const changes: Record<string, any> = {}; // eslint-disable-line @typescript-eslint/no-explicit-any
    Object.keys(data as Record<string, unknown>).forEach(key => {
      const dataObj = data as Record<string, unknown>;
      if (JSON.stringify(oldJSON[key]) !== JSON.stringify(dataObj[key])) {
        changes[key] = {
          old: oldJSON[key],
          new: dataObj[key],
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

    return NextResponse.json({ success: true, data: toProductJSON(product) });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    return handleApiError(error);
  }
}

// Partial update for fields that don't require full product validation (e.g. reactivating a
// soft-deleted product, where PUT's required name/price/stock checks would otherwise reject it).
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
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

    const product = await dbTransaction(async (tx) => {
      const oldProduct = await tx.product.findFirst({ where: { id, tenantId } });
      if (!oldProduct) {
        return null;
      }
      const updated = await tx.product.update({
        where: { id },
        data: updates as Prisma.ProductUncheckedUpdateInput,
        include: PRODUCT_INCLUDE,
      });
      return { oldProduct, updated };
    });

    if (!product) {
      return NextResponse.json({ success: false, error: 'Product not found' }, { status: 404 });
    }
    const { oldProduct, updated } = product;

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

    return NextResponse.json({ success: true, data: toProductJSON(updated) });
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

    // Cascade delete protection: prevent deletion if product is referenced in
    // completed transactions or saved carts (was a Mongoose pre-hook, moved inline).
    const [activeTransactionCount, savedCartCount, existing] = await Promise.all([
      prisma.transactionItem.count({ where: { productId: id, transaction: { status: 'completed' } } }),
      prisma.savedCartItem.count({ where: { productId: id } }),
      prisma.product.findFirst({ where: { id, tenantId, isActive: true } }),
    ]);

    if (!existing) {
      return NextResponse.json({ success: false, error: 'Product not found' }, { status: 404 });
    }

    if (activeTransactionCount > 0) {
      return handleApiError(
        new Error(
          `Cannot delete product "${existing.name}": ${activeTransactionCount} completed transaction(s) reference this product. Consider deactivating it instead.`
        )
      );
    }
    if (savedCartCount > 0) {
      return handleApiError(
        new Error(
          `Cannot delete product "${existing.name}": ${savedCartCount} saved cart(s) reference this product. Remove the product from saved carts first.`
        )
      );
    }

    const product = await prisma.product.update({
      where: { id },
      data: { isActive: false },
    });

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
