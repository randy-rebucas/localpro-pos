import prisma from '@/lib/prisma';

export async function listCategories(tenantId: string) {
  return prisma.category.findMany({
    where: { tenantId },
    orderBy: { name: 'asc' },
  });
}

export async function getCategoryById(tenantId: string, id: string) {
  return prisma.category.findFirst({ where: { id, tenantId } });
}

export async function createCategory(tenantId: string, data: { name: string; description?: string; isActive?: boolean }) {
  return prisma.category.create({
    data: {
      tenantId,
      name: data.name,
      description: data.description,
      isActive: data.isActive ?? true,
    },
  });
}

export async function updateCategory(
  tenantId: string,
  id: string,
  data: Partial<{ name: string; description: string | undefined; isActive: boolean }>
) {
  return prisma.category.update({
    where: { id },
    data,
  });
}

export async function countProductsInCategory(tenantId: string, categoryId: string) {
  return prisma.product.count({ where: { tenantId, categoryId } });
}
