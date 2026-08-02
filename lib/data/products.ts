import prisma from '@/lib/prisma';
import { Prisma } from '@prisma/client';

// Fields Product.create/update accept, taken from the old Mongoose model / validateProduct().
// Anything not on this list is dropped so callers can safely spread validated request bodies in.
const PRODUCT_WRITABLE_FIELDS = [
  'name', 'description', 'price', 'stock', 'sku', 'barcode', 'category', 'categoryId',
  'image', 'productType', 'hasVariations', 'variations', 'modifiers', 'allergens',
  'nutritionInfo', 'taxExempt', 'zeroRated', 'trackInventory', 'allowOutOfStockSales',
  'lowStockThreshold', 'pinned', 'serviceType', 'weightBased', 'pickupDelivery',
  'estimatedDuration', 'serviceDuration', 'staffRequired', 'equipmentRequired',
  'genericName', 'manufacturer', 'prn', 'batchNumber', 'expiryDate', 'drugSchedule',
  'requiresPrescription', 'storageConditions', 'activeIngredient', 'dosageStrength',
  'dosageForm', 'isActive',
] as const;

export function sanitizeProductInput(data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of PRODUCT_WRITABLE_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(data, key)) continue;
    let value = data[key];
    if (key === 'stock' && value !== undefined && value !== null) {
      value = BigInt(value as number);
    }
    if (key === 'expiryDate' && value) {
      value = new Date(value as string);
    }
    out[key] = value;
  }
  return out;
}

// Product docs come back with BigInt stock (JSON.stringify-unsafe) and Decimal price.
// Keep the Mongoose `_id` shape for the frontend.
export function serializeProduct<T extends { id: string; price: Prisma.Decimal; stock: bigint; categoryRef?: { id: string; name: string } | null }>(
  product: T
) {
  const { id, categoryRef, ...rest } = product as any; // eslint-disable-line @typescript-eslint/no-explicit-any
  return {
    _id: id,
    ...rest,
    price: Number(product.price),
    stock: Number(product.stock),
    categoryId: categoryRef ? { _id: categoryRef.id, name: categoryRef.name } : (product as any).categoryId ?? null, // eslint-disable-line @typescript-eslint/no-explicit-any
  };
}

export interface ProductFilters {
  search?: string;
  category?: string;
  categoryId?: string;
  isActive?: 'true' | 'false' | 'all' | null;
  filter?: 'missing-barcode' | 'missing-image' | null;
}

export function buildProductWhere(tenantId: string, filters: ProductFilters): Prisma.ProductWhereInput {
  const where: Prisma.ProductWhereInput = { tenantId };

  if (filters.isActive === 'true') {
    where.isActive = { not: false };
  } else if (filters.isActive === 'false') {
    where.isActive = false;
  } else if (filters.isActive === 'all') {
    // no filter
  } else {
    where.isActive = { not: false };
  }

  const andClauses: Prisma.ProductWhereInput[] = [];

  if (filters.filter === 'missing-barcode') {
    andClauses.push({ OR: [{ barcode: null }, { barcode: '' }] });
  } else if (filters.filter === 'missing-image') {
    andClauses.push({ OR: [{ image: null }, { image: '' }] });
  }

  if (filters.search) {
    andClauses.push({
      OR: [
        { name: { contains: filters.search, mode: 'insensitive' } },
        { description: { contains: filters.search, mode: 'insensitive' } },
        { sku: { contains: filters.search, mode: 'insensitive' } },
        { barcode: { contains: filters.search, mode: 'insensitive' } },
      ],
    });
  }

  if (filters.category) where.category = filters.category;
  if (filters.categoryId) where.categoryId = filters.categoryId;

  if (andClauses.length > 0) where.AND = andClauses;

  return where;
}

const withCategory = { categoryRef: { select: { id: true, name: true } } } satisfies Prisma.ProductInclude;

export async function findProducts(
  tenantId: string,
  filters: ProductFilters,
  pagination?: { skip: number; limit: number }
) {
  const where = buildProductWhere(tenantId, filters);
  const orderBy: Prisma.ProductOrderByWithRelationInput[] = [{ pinned: 'desc' }, { createdAt: 'desc' }];

  if (pagination) {
    const [products, total] = await Promise.all([
      prisma.product.findMany({ where, include: withCategory, orderBy, skip: pagination.skip, take: pagination.limit }),
      prisma.product.count({ where }),
    ]);
    return { products: products.map(serializeProduct), total };
  }

  const products = await prisma.product.findMany({ where, include: withCategory, orderBy });
  return { products: products.map(serializeProduct), total: products.length };
}

export async function getProductById(tenantId: string, id: string, activeOnly = false) {
  const product = await prisma.product.findFirst({
    where: { id, tenantId, ...(activeOnly ? { isActive: { not: false } } : {}) },
  });
  return product;
}

export async function countActiveProducts(tenantId: string) {
  return prisma.product.count({ where: { tenantId, isActive: true } });
}

export async function createProduct(tenantId: string, data: Record<string, unknown>) {
  const sanitized = sanitizeProductInput(data);
  const product = await prisma.product.create({
    data: { ...(sanitized as Prisma.ProductUncheckedCreateInput), tenantId },
  });
  return product;
}

export async function updateProductById(tenantId: string, id: string, data: Record<string, unknown>) {
  const sanitized = sanitizeProductInput(data);
  return prisma.product.update({
    where: { id },
    data: sanitized as Prisma.ProductUpdateInput,
  });
}

export async function softDeleteProduct(tenantId: string, id: string) {
  // Mirrors the old Mongoose findOneAndUpdate({_id,tenantId,isActive:true}) guard.
  const existing = await prisma.product.findFirst({ where: { id, tenantId, isActive: true } });
  if (!existing) return null;
  return prisma.product.update({ where: { id }, data: { isActive: false } });
}

export async function productSkuExists(tenantId: string, sku: string, excludeId?: string) {
  const count = await prisma.product.count({
    where: { tenantId, sku, ...(excludeId ? { id: { not: excludeId } } : {}) },
  });
  return count > 0;
}

export async function findProductByBarcodeOrSku(tenantId: string, code: string) {
  return prisma.product.findFirst({
    where: {
      tenantId,
      isActive: { not: false },
      OR: [
        { barcode: { equals: code, mode: 'insensitive' } },
        { sku: { equals: code, mode: 'insensitive' } },
      ],
    },
  });
}

export async function listProductIdsForScanSession(tenantId: string, filter: string) {
  const where: Prisma.ProductWhereInput = { tenantId, isActive: { not: false } };
  if (filter === 'missing-barcode') {
    where.OR = [{ barcode: null }, { barcode: '' }];
  } else if (filter === 'missing-image') {
    where.OR = [{ image: null }, { image: '' }];
  }
  const products = await prisma.product.findMany({
    where,
    select: { id: true },
    orderBy: { updatedAt: 'asc' },
  });
  return products.map((p) => p.id);
}
