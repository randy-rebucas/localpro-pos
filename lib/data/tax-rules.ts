import prisma from '@/lib/prisma';
import { Prisma, TaxAppliesTo } from '@prisma/client';

export async function findTaxRules(tenantId: string, isActive?: boolean) {
  const where: Prisma.TaxRuleWhereInput = { tenantId };
  if (isActive !== undefined) where.isActive = isActive;
  return prisma.taxRule.findMany({
    where,
    orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
  });
}

export async function getTaxRuleById(tenantId: string, id: string) {
  return prisma.taxRule.findFirst({ where: { id, tenantId } });
}

export async function createTaxRule(
  tenantId: string,
  data: {
    name: string;
    rate: number;
    label?: string;
    appliesTo?: TaxAppliesTo;
    categoryIds?: string[];
    productIds?: string[];
    region?: unknown;
    priority?: number;
    isActive?: boolean;
  }
) {
  return prisma.taxRule.create({
    data: {
      tenantId,
      name: data.name,
      rate: data.rate,
      label: data.label || 'Tax',
      appliesTo: data.appliesTo || 'all',
      categoryIds: data.categoryIds || [],
      productIds: data.productIds || [],
      region: data.region ?? {},
      priority: data.priority || 0,
      isActive: data.isActive !== undefined ? data.isActive : true,
    },
  });
}

export async function updateTaxRule(id: string, data: Prisma.TaxRuleUpdateInput) {
  return prisma.taxRule.update({ where: { id }, data });
}

export async function deleteTaxRule(id: string) {
  return prisma.taxRule.delete({ where: { id } });
}
