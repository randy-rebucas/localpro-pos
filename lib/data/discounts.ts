import prisma from '@/lib/prisma';
import { Prisma } from '@prisma/client';

/**
 * Legal discount definitions — Philippine law requires these discounts.
 * They are auto-seeded for every tenant on first access.
 *
 * Prisma-backed replacement for lib/discount-seeds.ts's ensureLegalDiscounts
 * (that file is still Mongoose-backed and out of scope for this batch — see
 * app/api/discounts/route.ts and app/api/discounts/validate/route.ts, which
 * use this version instead so their reads/writes stay on Postgres).
 */
const LEGAL_DISCOUNTS = [
  {
    code: 'SC20',
    name: 'Senior Citizen Discount (RA 9994)',
    description: '20% discount for Senior Citizens per Republic Act 9994',
    type: 'percentage' as const,
    value: 20,
    category: 'senior' as const,
    requiresIdVerification: true,
    validFrom: new Date('2024-01-01'),
    validUntil: new Date('2030-12-31'),
    isActive: true,
    usageCount: 0,
  },
  {
    code: 'PWD20',
    name: 'PWD Discount (RA 10754)',
    description: '20% discount for Persons with Disability per Republic Act 10754',
    type: 'percentage' as const,
    value: 20,
    category: 'pwd' as const,
    requiresIdVerification: true,
    validFrom: new Date('2024-01-01'),
    validUntil: new Date('2030-12-31'),
    isActive: true,
    usageCount: 0,
  },
];

export const LEGAL_DISCOUNT_CODES = LEGAL_DISCOUNTS.map((d) => d.code);

export async function ensureLegalDiscounts(tenantId: string) {
  for (const def of LEGAL_DISCOUNTS) {
    const exists = await prisma.discount.findFirst({ where: { tenantId, code: def.code } });
    if (!exists) {
      try {
        await prisma.discount.create({ data: { ...def, tenantId } });
      } catch (err: unknown) {
        // Ignore race on unique(tenantId, code) — another request seeded it first.
        if ((err as { code?: string })?.code !== 'P2002') throw err;
      }
    }
  }
}

export interface DiscountFilters {
  code?: string;
  activeOnly?: boolean;
}

export async function findDiscounts(tenantId: string, filters: DiscountFilters) {
  const where: Prisma.DiscountWhereInput = { tenantId };
  if (filters.code) where.code = filters.code;
  if (filters.activeOnly) {
    const now = new Date();
    where.isActive = true;
    where.validFrom = { lte: now };
    where.validUntil = { gte: now };
  }
  return prisma.discount.findMany({ where, orderBy: { createdAt: 'desc' } });
}

export async function findDiscountByCode(tenantId: string, code: string, activeOnly = false) {
  return prisma.discount.findFirst({
    where: { tenantId, code, ...(activeOnly ? { isActive: true } : {}) },
  });
}

export async function createDiscount(
  tenantId: string,
  data: Omit<Prisma.DiscountUncheckedCreateInput, 'tenantId'>
) {
  return prisma.discount.create({ data: { ...data, tenantId } });
}

export async function getDiscountById(tenantId: string, id: string) {
  return prisma.discount.findFirst({ where: { id, tenantId } });
}

export async function updateDiscount(id: string, data: Prisma.DiscountUpdateInput) {
  return prisma.discount.update({ where: { id }, data });
}

export async function deleteDiscount(id: string) {
  return prisma.discount.delete({ where: { id } });
}
