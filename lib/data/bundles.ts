import prisma from '@/lib/prisma';
import { Prisma } from '@prisma/client';

export interface BundleItemInput {
  productId: string;
  productName: string;
  quantity: number;
  variation?: { size?: string; color?: string; type?: string } | null;
}

const bundleInclude = {
  items: {
    include: {
      product: { select: { id: true, name: true, price: true, stock: true } },
    },
  },
  categoryRef: { select: { id: true, name: true } },
} satisfies Prisma.ProductBundleInclude;

function serializeBundle(bundle: Prisma.ProductBundleGetPayload<{ include: typeof bundleInclude }>) {
  const { id, items, categoryRef, ...rest } = bundle;
  return {
    _id: id,
    ...rest,
    price: Number(bundle.price),
    categoryId: categoryRef ? { _id: categoryRef.id, name: categoryRef.name } : rest.categoryId ?? null,
    items: items.map((item) => ({
      _id: item.id,
      productId: item.product
        ? { _id: item.product.id, name: item.product.name, price: Number(item.product.price), stock: Number(item.product.stock) }
        : item.productId,
      productName: item.productName,
      quantity: item.quantity,
      variation: item.variation,
    })),
  };
}

export async function findBundles(
  tenantId: string,
  filters: {
    search?: string;
    isActive?: boolean;
    categoryId?: string;
    minPrice?: number;
    maxPrice?: number;
    startDate?: Date;
    endDate?: Date;
  }
) {
  const where: Prisma.ProductBundleWhereInput = { tenantId };
  if (filters.search) {
    where.OR = [
      { name: { contains: filters.search, mode: 'insensitive' } },
      { description: { contains: filters.search, mode: 'insensitive' } },
      { sku: { contains: filters.search, mode: 'insensitive' } },
    ];
  }
  if (filters.isActive !== undefined) where.isActive = filters.isActive;
  if (filters.categoryId) where.categoryId = filters.categoryId;
  if (filters.minPrice !== undefined || filters.maxPrice !== undefined) {
    where.price = {};
    if (filters.minPrice !== undefined) where.price.gte = filters.minPrice;
    if (filters.maxPrice !== undefined) where.price.lte = filters.maxPrice;
  }
  if (filters.startDate || filters.endDate) {
    where.createdAt = {};
    if (filters.startDate) where.createdAt.gte = filters.startDate;
    if (filters.endDate) where.createdAt.lte = filters.endDate;
  }

  const bundles = await prisma.productBundle.findMany({
    where,
    include: bundleInclude,
    orderBy: { createdAt: 'desc' },
  });

  return bundles.map(serializeBundle);
}

export async function getBundleById(tenantId: string, id: string) {
  const bundle = await prisma.productBundle.findFirst({
    where: { id, tenantId },
    include: bundleInclude,
  });
  return bundle ? serializeBundle(bundle) : null;
}

export async function createBundle(
  tenantId: string,
  data: {
    name: string;
    description?: string;
    price: number;
    items: BundleItemInput[];
    sku?: string;
    categoryId?: string;
    image?: string;
    trackInventory?: boolean;
  }
) {
  const bundle = await prisma.productBundle.create({
    data: {
      tenantId,
      name: data.name,
      description: data.description,
      price: data.price,
      sku: data.sku,
      categoryId: data.categoryId,
      image: data.image,
      trackInventory: data.trackInventory !== false,
      isActive: true,
      items: {
        create: data.items.map((item) => ({
          productId: item.productId,
          productName: item.productName,
          quantity: item.quantity,
          variation: item.variation ?? undefined,
        })),
      },
    },
    include: bundleInclude,
  });
  return serializeBundle(bundle);
}

export async function updateBundle(
  tenantId: string,
  id: string,
  data: Partial<{
    name: string;
    description: string;
    price: number;
    items: BundleItemInput[];
    sku: string;
    categoryId: string;
    image: string;
    trackInventory: boolean;
    isActive: boolean;
  }>
) {
  const updateData: Prisma.ProductBundleUpdateInput = {};
  if (data.name !== undefined) updateData.name = data.name;
  if (data.description !== undefined) updateData.description = data.description;
  if (data.price !== undefined) updateData.price = data.price;
  if (data.sku !== undefined) updateData.sku = data.sku;
  if (data.categoryId !== undefined) updateData.categoryRef = data.categoryId ? { connect: { id: data.categoryId } } : { disconnect: true };
  if (data.image !== undefined) updateData.image = data.image;
  if (data.trackInventory !== undefined) updateData.trackInventory = data.trackInventory;
  if (data.isActive !== undefined) updateData.isActive = data.isActive;

  if (data.items) {
    updateData.items = {
      deleteMany: {},
      create: data.items.map((item) => ({
        productId: item.productId,
        productName: item.productName,
        quantity: item.quantity,
        variation: item.variation ?? undefined,
      })),
    };
  }

  const bundle = await prisma.productBundle.update({
    where: { id },
    data: updateData,
    include: bundleInclude,
  });
  return serializeBundle(bundle);
}

export async function setBundleActive(tenantId: string, id: string, isActive: boolean) {
  const bundle = await prisma.productBundle.update({
    where: { id },
    data: { isActive },
    include: bundleInclude,
  });
  return serializeBundle(bundle);
}

export async function bulkSetBundlesActive(tenantId: string, bundleIds: string[], isActive: boolean) {
  const result = await prisma.productBundle.updateMany({
    where: { id: { in: bundleIds }, tenantId },
    data: { isActive },
  });
  return result.count;
}
